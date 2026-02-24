// Processing limits
export const FREE_TIER_LIMIT = 300;
export const EXTENSION_FREE_TIER_LIMIT = 1500; // ~1 hour video worth of captions
export const MAX_FILE_SIZE_MB = 5;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_REQUEST_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// Rate limiting
export const RATE_LIMIT_REQUESTS = 30;
export const RATE_LIMIT_WINDOW_SECONDS = 60;

// License verification
export const LICENSE_CACHE_TTL_SECONDS = 300; // 5 minutes
export const LEMON_SQUEEZY_API_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';
export const LICENSE_INSTANCE_NAME = 'glide-web';

// Supported formats and modes
export const SUPPORTED_FORMATS = ['srt', 'vtt', 'ass', 'plain'];
export const SUPPORTED_MODES = ['focus', 'calm'];

// Intensity bounds
export const MIN_INTENSITY = 0.1;
export const MAX_INTENSITY = 1.0;
export const DEFAULT_INTENSITY = 0.5;
