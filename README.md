# Vigil

Customizable real-time intelligence dashboard — one pausable "operations room" of maps, news, RSS, social, markets, charts, and weather widgets, built to kill tab-fatigue. Live at https://thevigilroom.com

## Stack
React + Vite · Zustand · Supabase (auth + Postgres + RLS) · Stripe · MapLibre GL · TradingView embeds · Vercel (Hobby).

## Local development
1. `npm install`
2. Copy `.env.example` → `.env.local` and fill in the values.
3. `npm run dev`  (Vite dev server on http://localhost:5173)

Note: the `/api` serverless functions do not run under `vite dev`. Test them against a Vercel preview deploy.

## Build & deploy
- `npm run build` — production build.
- Deploy is automatic: push to `main` → Vercel builds and deploys.
