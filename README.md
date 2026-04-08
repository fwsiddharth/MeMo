# MEMO

Personal anime app with account-scoped sync and multi-source streaming:

- Next.js frontend (mobile + desktop responsive)
- Fastify backend (metadata + stream resolver + extensions)
- Supabase-backed history, favorites, settings, and trackers
- Favorites + Library workspace

## Structure

- `frontend/`: UI (Home, Search, Anime Detail, Player)
- `backend/`: APIs, AniList/Kitsu proxy, extension runtime, Supabase integration

## Quick Start

1. Install dependencies:

```bash
cd /Users/onepiece/MEMO
npm install
```

2. Start backend (Terminal 1):

```bash
npm run dev:backend
```

3. Start frontend (Terminal 2):

```bash
npm run dev:frontend
```

Optional script checks:

```bash
npm run build:backend
npm run build:frontend
```

4. Open:

`http://localhost:3000`

Backend runs on `http://localhost:4000`.

## Notes

- AniList is primary metadata source, Kitsu is fallback.
- Streaming is extension-based (`allanime`, `allmanga-web`, `gojowtf`, `kaa-manifest`, `animesalt`).
- User data is persisted in Supabase tables (`watch_history`, `favorites`, `app_settings`, `trackers`).
- `/api/media` proxies stream playlists/segments for better playback reliability.
- Player includes skip controls, speed controls, subtitle tracks, and autoplay-next toggle.

## Environment

Backend (`backend/.env.local`):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_ORIGINS` (comma-separated exact origins)
- `ALLOW_VERCEL_PREVIEWS=1` (optional; allows `.vercel.app` origins)
- `MEDIA_PROXY_ALLOWED_HOSTS` (recommended in all envs; required for media proxy in production strict mode, supports `*.domain.com`)
- `MEDIA_PROXY_STRICT_MODE` (optional; defaults to `1` in production, `0` outside production)

Frontend (`frontend/.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_BASE` (optional)
- `NEXT_IMAGE_REMOTE_HOSTS` (optional; comma-separated HTTPS hosts for remote images)

Copy starter values from [backend/.env.example](backend/.env.example) and [frontend/.env.example](frontend/.env.example).

See [SECURITY.md](SECURITY.md) for deployment hardening details.
