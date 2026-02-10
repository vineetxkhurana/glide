# Glide

Bionic subtitle processing for better readability. Partial-word bolding helps viewers with ADHD and reading difficulties focus on content.

**Live:** https://glide-web-app.pages.dev

## Features

- **Focus Mode**: NLP-driven partial-word bolding for optimal reading flow
- **Calm Mode**: Full-word bolding, max 2 words per line
- **Free Tier**: 75 subtitle entries
- **Lifetime License**: $29 for unlimited processing
- **Formats**: SRT, VTT, ASS with HTML tag preservation

## Architecture

```
glide/
├── apps/
│   ├── api-worker/      # Cloudflare Worker (license + processing)
│   └── web-app/         # Static UI (Cloudflare Pages)
└── packages/
    └── engine-core/     # Core bionic engine
```

## Setup

```bash
npm install
npm run build
```

## Deploy

**API Worker:**
```bash
cd apps/api-worker
npm run deploy
```

**Web App:**
```bash
cd apps/web-app
npm run build
npx wrangler pages deploy dist
```

## Environment Variables

**API Worker** (via `wrangler secret put`):
- `LEMON_API_KEY` - Lemon Squeezy API key for license verification

## License

MIT