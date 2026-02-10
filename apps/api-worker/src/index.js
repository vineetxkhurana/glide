import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { processSubtitles } from '@glide/engine-core'

const app = new Hono()

app.use('/*', cors())

app.get('/health', (c) => c.json({ status: 'ok' }))

async function verifyLicense(key, env) {
  if (!key || !env?.LEMON_API_KEY) return { valid: false }
  
  try {
    const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.LEMON_API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        license_key: key,
        instance_name: 'glide-web'
      })
    })
    
    if (!response.ok) {
      console.error('License verification HTTP error:', response.status)
      return { valid: false }
    }
    
    const data = await response.json()
    const valid = data.valid === true || data?.meta?.valid === true || data?.license_key?.valid === true
    return { valid: !!valid }
  } catch (error) {
    console.error('License verification error:', error)
    return { valid: false }
  }
}

function truncateSubtitles(text, format) {
  const lines = text.split('\n')
  const result = []
  let count = 0
  
  if (format === 'plain') {
    return {
      text: lines.slice(0, 75).join('\n'),
      truncated: lines.length > 75,
      linesProcessed: lines.length > 75 ? 75 : null
    }
  }
  
  if (format === 'ass') {
    for (const line of lines) {
      if (line.startsWith('Dialogue:')) {
        count++
        if (count > 75) break
      }
      result.push(line)
    }
    return {
      text: result.join('\n'),
      truncated: count > 75,
      linesProcessed: count > 75 ? 75 : null
    }
  }
  
  // SRT/VTT: count lines with -->
  for (const line of lines) {
    if (line.includes('-->')) {
      count++
      if (count > 75) break
    }
    result.push(line)
  }
  
  return {
    text: result.join('\n'),
    truncated: count > 75,
    linesProcessed: count > 75 ? 75 : null
  }
}

app.post('/process', async (c) => {
  try {
    const { text, format, mode, intensity, licenseKey } = await c.req.json()
    
    if (!text || !format || !mode) {
      return c.json({ error: 'Missing required fields' }, 400)
    }
    
    if (!['srt', 'vtt', 'ass', 'plain'].includes(format)) {
      return c.json({ error: 'format must be srt, vtt, ass, or plain' }, 400)
    }
    
    if (!['focus', 'calm'].includes(mode)) {
      return c.json({ error: 'mode must be focus or calm' }, 400)
    }
    
    const safeIntensity = typeof intensity === 'number' 
      ? Math.min(1, Math.max(0.1, intensity))
      : 0.5
    
    const license = await verifyLicense(licenseKey, c.env)
    
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
    return c.json({ error: error.message }, 500)
  }
})

export default app
