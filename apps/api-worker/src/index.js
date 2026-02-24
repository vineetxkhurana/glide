import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { processSubtitles } from '@glide/engine-core';
import {
  FREE_TIER_LIMIT,
  EXTENSION_FREE_TIER_LIMIT,
  LICENSE_CACHE_TTL_SECONDS,
  LEMON_SQUEEZY_API_URL,
  LICENSE_INSTANCE_NAME,
  RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW_SECONDS,
  MAX_REQUEST_SIZE_BYTES,
} from './constants.js';

const app = new Hono();

const processRequestSchema = z.object({
  text: z.string().min(1, 'Text cannot be empty').max(10_000_000, 'Text exceeds maximum length'),
  format: z.enum(['srt', 'vtt', 'ass', 'plain'], {
    errorMap: () => ({ message: 'format must be one of: srt, vtt, ass, plain' }),
  }),
  mode: z.enum(['focus', 'calm'], {
    errorMap: () => ({ message: 'mode must be one of: focus, calm' }),
  }),
  intensity: z.number().min(0.1).max(1.0).optional().default(0.5),
  emphasisMode: z.enum(['html', 'unicode']).optional(),
  licenseKey: z
    .string()
    .regex(/^[A-Z0-9-]{8,50}$/, 'Invalid license key format')
    .optional()
    .nullable(),
});

const ALLOWED_ORIGINS = ['https://glide-web-app.pages.dev', 'http://localhost:5173'];

// Add your Chrome extension ID after publishing to Chrome Web Store
// For development, allow all chrome extensions. Lock down before production.
const ALLOWED_EXTENSION_IDS = [];

app.use(
  '/*',
  cors({
    origin: (origin) => {
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      if (ALLOWED_EXTENSION_IDS.length && ALLOWED_EXTENSION_IDS.includes(origin)) return origin;
      if (!ALLOWED_EXTENSION_IDS.length && origin?.startsWith('chrome-extension://')) return origin;
      return null;
    },
    credentials: true,
    maxAge: 86400,
  }),
);

app.use('/*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
});

app.use('/process', async (c, next) => {
  const contentLength = c.req.header('content-length');
  if (!contentLength) {
    return c.json({ error: 'Content-Length header required' }, 411);
  }
  const size = parseInt(contentLength, 10);
  if (size > MAX_REQUEST_SIZE_BYTES) {
    return c.json({ error: 'Payload too large. Maximum size: 10MB' }, 413);
  }
  await next();
});

app.get('/health', (c) => c.json({ status: 'ok' }));

// Best-effort rate limiter using KV
// Note: KV lacks atomic increment, so this is probabilistic under high concurrency
// For strict rate limiting, migrate to Durable Objects
async function checkRateLimit(ip, env) {
  const kv = env.RATE_LIMIT_KV;
  if (!kv) return { allowed: true };

  const key = `ratelimit:${ip}`;
  const current = await kv.get(key);

  if (!current) {
    await kv.put(key, '1', { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
    return { allowed: true, remaining: RATE_LIMIT_REQUESTS - 1 };
  }

  const count = parseInt(current, 10);

  if (count >= RATE_LIMIT_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  await kv.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
  return { allowed: true, remaining: RATE_LIMIT_REQUESTS - count - 1 };
}

async function verifyWebhookSignature(body, signature, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const expected = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return expected === signature;
}

async function verifyLicenseWithCache(key, env) {
  if (!key || !env?.LEMON_API_KEY) return { valid: false };

  // Check revocation first
  const revoked = await env.REVOKED_KEYS?.get(`revoked:${key}`);
  if (revoked) return { valid: false };

  const cache = env.LICENSE_CACHE;
  if (!cache) {
    console.warn('LICENSE_CACHE not available, skipping cache');
    return verifyLicenseFromAPI(key, env);
  }

  // Check cache first
  const cacheKey = `license:${key}`;
  const cached = await cache.get(cacheKey, 'json');

  if (cached !== null) {
    return cached;
  }

  // Cache miss - verify with API
  const result = await verifyLicenseFromAPI(key, env);

  // Only cache valid licenses to prevent cache poisoning on API failures
  if (result.valid) {
    await cache.put(cacheKey, JSON.stringify(result), {
      expirationTtl: LICENSE_CACHE_TTL_SECONDS,
    });
  }

  return result;
}

async function verifyLicenseFromAPI(key, env) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(LEMON_SQUEEZY_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.LEMON_API_KEY}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        license_key: key,
        instance_name: LICENSE_INSTANCE_NAME,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('License verification HTTP error:', response.status);
      return { valid: false };
    }

    const data = await response.json();
    const valid =
      data.valid === true || data?.meta?.valid === true || data?.license_key?.valid === true;
    return { valid: !!valid };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error('License verification timeout');
    } else {
      console.error('License verification error:', error);
    }
    return { valid: false };
  }
}

function truncateSubtitles(text, format, freeLimit) {
  const lines = text.split('\n');
  const result = [];
  let count = 0;

  if (format === 'plain') {
    return {
      text: lines.slice(0, freeLimit).join('\n'),
      truncated: lines.length > freeLimit,
      linesProcessed: lines.length > freeLimit ? freeLimit : null,
    };
  }

  if (format === 'ass') {
    for (const line of lines) {
      if (line.startsWith('Dialogue:')) {
        count++;
        if (count > freeLimit) break;
      }
      result.push(line);
    }
    return {
      text: result.join('\n'),
      truncated: count > freeLimit,
      linesProcessed: count > freeLimit ? freeLimit : null,
    };
  }

  // SRT/VTT: count lines with -->
  for (const line of lines) {
    if (line.includes('-->')) {
      count++;
      if (count > freeLimit) break;
    }
    result.push(line);
  }

  return {
    text: result.join('\n'),
    truncated: count > freeLimit,
    linesProcessed: count > freeLimit ? freeLimit : null,
  };
}

app.post('/process', async (c) => {
  try {
    // Rate limiting
    const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
    const rateLimit = await checkRateLimit(ip, c.env);

    if (!rateLimit.allowed) {
      return c.json({ error: 'Rate limit exceeded. Try again later.' }, 429, {
        'Retry-After': String(RATE_LIMIT_WINDOW_SECONDS),
      });
    }

    const body = await c.req.json();
    const validationResult = processRequestSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return c.json({ error: 'Validation failed', details: errors }, 400);
    }

    const { text, format, mode, intensity, emphasisMode, licenseKey } = validationResult.data;

    const license = await verifyLicenseWithCache(licenseKey, c.env);

    // Extension requests get a higher free tier limit
    const origin = c.req.header('origin') || '';
    const isExtension = origin.startsWith('chrome-extension://');
    const freeLimit = isExtension ? EXTENSION_FREE_TIER_LIMIT : FREE_TIER_LIMIT;

    let inputText = text;
    let truncated = false;
    let linesProcessed = null;

    if (!license.valid) {
      const truncateResult = truncateSubtitles(text, format, freeLimit);
      inputText = truncateResult.text;
      truncated = truncateResult.truncated;
      linesProcessed = truncateResult.linesProcessed;
    }

    const result = processSubtitles({
      text: inputText,
      format,
      mode,
      intensity,
      emphasisMode,
    });

    return c.json({
      processedText: result.processedText,
      truncated,
      linesProcessed,
    });
  } catch (error) {
    console.error('Processing error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post('/webhook/license', async (c) => {
  try {
    const secret = c.env.LEMON_WEBHOOK_SECRET;
    if (!secret) return c.json({ error: 'Webhook not configured' }, 500);

    const signature = c.req.header('x-signature');
    if (!signature) return c.json({ error: 'Missing signature' }, 401);

    const rawBody = await c.req.text();
    const valid = await verifyWebhookSignature(rawBody, signature, secret);
    if (!valid) return c.json({ error: 'Invalid signature' }, 401);

    const { event_name, data } = JSON.parse(rawBody);
    const licenseKey = data?.attributes?.first_order_item?.license_key;

    if (!licenseKey) return c.json({ received: true, action: 'no_key' });

    if (
      event_name === 'order_refunded' ||
      event_name === 'subscription_cancelled' ||
      event_name === 'license_key_deactivated'
    ) {
      await c.env.LICENSE_CACHE.delete(`license:${licenseKey}`);
      await c.env.REVOKED_KEYS.put(`revoked:${licenseKey}`, '1');
      return c.json({ received: true, action: 'revoked' });
    }

    return c.json({ received: true, action: 'ignored' });
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

export default app;
