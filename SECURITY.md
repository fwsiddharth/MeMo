# Security Guide

This document covers production hardening for MEMO.

## 1) Required environment setup

### Backend

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_ORIGINS` (comma-separated exact origins)
- `MEDIA_PROXY_ALLOWED_HOSTS` (comma-separated host allowlist)

Recommended:

- `MEDIA_PROXY_STRICT_MODE=1` (enabled by default in production)
- `ALLOW_VERCEL_PREVIEWS=0` (default). Only set to `1` if you intentionally trust all `*.vercel.app` previews.

### Frontend

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_IMAGE_REMOTE_HOSTS` (optional additional HTTPS hosts for remote images)

## 2) Media proxy policy (`/api/media`)

- Private/local network hosts are blocked.
- Redirects are followed manually and each hop is host-validated.
- In production, strict mode defaults to enabled; if `MEDIA_PROXY_ALLOWED_HOSTS` is empty, media proxy requests are rejected.

Example allowlist:

`MEDIA_PROXY_ALLOWED_HOSTS=krussdomi.com,*.krussdomi.com,animesalt.ac,*.animesalt.ac`

Built-in providers baseline (from current source code):

`MEDIA_PROXY_ALLOWED_HOSTS=animesalt.ac,*.animesalt.ac,api.allanime.day,allmanga.to,animetsu.net,ani.metsu.site,vidnest.io,bysekoze.com,raw.githubusercontent.com,kaa.lt,krussdomi.com,*.krussdomi.com`

Notes:

- Some upstream providers can return media URLs on additional CDN hosts. If playback fails with host-block errors, add only the exact failing host(s).
- Keep wildcard usage minimal and provider-specific.

## 3) Auth callback safety

- OAuth callback only accepts internal relative next-paths.
- External redirect targets are rejected and fall back to `/`.

## 4) Deployment checklist

- Set explicit `FRONTEND_ORIGINS` for your production app URLs.
- Keep `MEDIA_PROXY_ALLOWED_HOSTS` minimal and source-specific.
- Rotate Supabase service-role keys periodically.
- Ensure HTTPS is enforced at your edge/reverse-proxy.