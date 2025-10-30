# Zaynix (Supabase) — File Uploader + Proxy CDN

## Quick start

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill values (or use provided `.env`).
3. Run locally: `npm run dev` or `npm start`.
4. Open `http://localhost:3000` to use upload UI.

## Deploy
- For Vercel: set environment variables in Vercel dashboard (SUPABASE_URL, SUPABASE_KEY, SUPABASE_BUCKET, DELETE_TOKEN).
- This app proxies requests like `https://your-domain.com/1630319889-file.mp4` to Supabase public object URL.
- Make sure the bucket is public (objects are publicly accessible).

## Notes
- Files are stored permanently in Supabase Storage (public bucket).
- Delete endpoint is protected with DELETE_TOKEN (simple protection). Change token in env.
