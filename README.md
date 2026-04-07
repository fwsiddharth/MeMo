# MEMO

Local-first personal anime app scaffold with:

- Next.js frontend (mobile + desktop responsive)
- Fastify backend (metadata + stream resolver + extensions)
- SQLite watch history / continue watching
- Favorites + Library workspace

## Structure

- `frontend/`: UI (Home, Search, Anime Detail, Player)
- `backend/`: APIs, AniList/Kitsu proxy, extension runtime, SQLite

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

4. Open:

`http://localhost:3000`

Backend runs on `http://localhost:4000`.

## Notes

- AniList is primary metadata source, Kitsu is fallback.
- Streaming is extension-based. Default source is now `kaa-manifest` (reads KAA JSON manifest URL), with `mock-hianime` as fallback.
- Watch progress is saved locally in `backend/memo.db`.
- `/api/media` proxies stream playlists/segments for better playback reliability.
- Player includes skip controls, speed controls, subtitle tracks, and autoplay-next toggle.
