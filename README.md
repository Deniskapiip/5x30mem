# Controllers Map MVP

Production-ready MVP: Next.js + TypeScript + Tailwind + Supabase + Yandex Maps.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create env:
   ```bash
   cp .env.example .env.local
   ```
3. Fill `.env.local` with Supabase + Yandex Maps API keys.
4. Run SQL from `supabase/schema.sql` in Supabase SQL Editor.
5. Start app:
   ```bash
   npm run dev
   ```

## Features

- Shared map with controller markers
- Public marker creation (no auth)
- Realtime sync via Supabase Realtime
- Balloon popup cards
- Search + filters
- Responsive minimal UI

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
