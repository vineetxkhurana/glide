import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { processSubtitles } from '@glide/engine-core'
import {
  FREE_TIER_LIMIT,
  LICENSE_CACHE_TTL_SECONDS,
  LEMON_SQUEEZY_API_URL,
  LICENSE_INSTANCE_NAME,
  SUPPORTED_FORMATS,
  SUPPORTED_MODES,
  MIN_INTENSITY,
  MAX_INTENSITY,
  DEFAULT_INTENSITY,
  RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW_SECONDS
} from './constants.js'

const app = new Hono()

app.use('/*', cors())

app.get('/health', (c) => c.json({ status: 'ok' }))

// Best-effort rate limiter using KV
// Note: KV lacks atomic increment, so this is probabilistic under high concurrency
// For strict rate limiting, migrate to Durable Objects
async function checkRateLimit(ip, env) {
  const kv = env.RATE_LIMIT_KV
  if (!kv) return { allowed: true }
  
  const key = `ratelimit:${ip}`
  const current = await kv.get(key)
  
  if (!current) {
    await kv.put(key, '1', { expirationTtl: RATE_LIMIT_WINDOW_SECONDS })
    return { allowed: true, remaining: RATE_LIMIT_REQUESTS - 1 }
  }
  
  const count = parseInt(current, 10)
  
  if (count >= RATE_LIMIT_REQUESTS) {
    return { allowed: false, remaining: 0 }
  }
  
  await kv.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS })
  return { allowed: true, remaining: RATE_LIMIT_REQUESTS - count - 1 }
}

async function verifyLicenseWithCache(key, env) {
  if (!key || !env?.LEMON_API_KEY) return { valid: false }
  
  const cache = env.LICENSE_CACHE
  if (!cache) {
    console.warn('LICENSE_CACHE not available, skipping cache')
    return verifyLicenseFromAPI(key, env)
  }
  
  // Check cache first
  const cacheKey = `license:${key}`
  const cached = await cache.get(cacheKey, 'json')
  
  if (cached !== null) {
    return cached
  }
  
  // Cache miss - verify with API
  const result = await verifyLicenseFromAPI(key, env)
  
  // Only cache valid licenses to prevent cache poisoning on API failures
  if (result.valid) {
    await cache.put(cacheKey, JSON.stringify(result), {
      expirationTtl: LICENSE_CACHE_TTL_SECONDS
    })
  }
  
  return result
}

async function verifyLicenseFromAPI(key, env) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  
  try {
    const response = await fetch(LEMON_SQUEEZY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.LEMON_API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        license_key: key,
        instance_name: LICENSE_INSTANCE_NAME
      }),
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      console.error('License verification HTTP error:', response.status)
      return { valid: false }
    }
    
    const data = await response.json()
    const valid = data.valid === true || data?.meta?.valid === true || data?.license_key?.valid === true
    return { valid: !!valid }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      console.error('License verification timeout')
    } else {
      console.error('License verification error:', error)
    }
    return { valid: false }
  }
}

function truncateSubtitles(text, format) {
  const lines = text.split('\n')
  const result = []
  let count = 0
  
  if (format === 'plain') {
    return {
      text: lines.slice(0, FREE_TIER_LIMIT).join('\n'),
      truncated: lines.length > FREE_TIER_LIMIT,
      linesProcessed: lines.length > FREE_TIER_LIMIT ? FREE_TIER_LIMIT : null
    }
  }
  
  if (format === 'ass') {
    for (const line of lines) {
      if (line.startsWith('Dialogue:')) {
        count++
        if (count > FREE_TIER_LIMIT) break
      }
      result.push(line)
    }
    return {
      text: result.join('\n'),
      truncated: count > FREE_TIER_LIMIT,
      linesProcessed: count > FREE_TIER_LIMIT ? FREE_TIER_LIMIT : null
    }
  }
  
  // SRT/VTT: count lines with -->
  for (const line of lines) {
    if (line.includes('-->')) {
      count++
      if (count > FREE_TIER_LIMIT) break
    }
    result.push(line)
  }
  
  return {
    text: result.join('\n'),
    truncated: count > FREE_TIER_LIMIT,
    linesProcessed: count > FREE_TIER_LIMIT ? FREE_TIER_LIMIT : null
  }
}

app.post('/process', async (c) => {
  try {
    // Rate limiting
    const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
    const rateLimit = await checkRateLimit(ip, c.env)
    
    if (!rateLimit.allowed) {
      return c.json(
        { error: 'Rate limit exceeded. Try again later.' },
        429,
        { 'Retry-After': String(RATE_LIMIT_WINDOW_SECONDS) }
      )
    }
    
    const { text, format, mode, intensity, licenseKey } = await c.req.json()
    
    if (!text || !format || !mode) {
      return c.json({ error: 'Missing required fields' }, 400)
    }
    
    if (!SUPPORTED_FORMATS.includes(format)) {
      return c.json({ error: `format must be one of: ${SUPPORTED_FORMATS.join(', ')}` }, 400)
    }
    
    if (!SUPPORTED_MODES.includes(mode)) {
      return c.json({ error: `mode must be one of: ${SUPPORTED_MODES.join(', ')}` }, 400)
    }
    
    const safeIntensity = typeof intensity === 'number' 
      ? Math.min(MAX_INTENSITY, Math.max(MIN_INTENSITY, intensity))
      : DEFAULT_INTENSITY
    
    const license = await verifyLicenseWithCache(licenseKey, c.env)
    
    let inputText = text
    let truncated = false
    let linesProcessed = null
    
    if (!license.valid) {
      const truncateResult = truncateSubtitles(text, format)
      inputText = truncateResult.text
      truncated = truncateResult.truncated
      linesProcessed = truncateResult.linesProcessed
    }
    
    const result = processSubtitles({
      text: inputText,
      format,
      mode,
      intensity: safeIntensity,
      emphasisMode: 'html'
    })
    
    return c.json({
      processedText: result.processedText,
      truncated,
      linesProcessed
    })
  } catch (error) {
    console.error('Processing error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
