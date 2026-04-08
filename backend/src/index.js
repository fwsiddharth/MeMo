const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Fastify = require("fastify");
const cors = require("@fastify/cors");
const { z } = require("zod");

const {
  initDb,
  saveProgress,
  getContinueWatching,
  getAnimeHistory,
  getRecentHistory,
  getResume,
  addFavorite,
  removeFavorite,
  isFavorite,
  listFavorites,
  getSettings,
  updateSettings,
  listTrackers,
  connectTracker,
  disconnectTracker,
} = require("./db-supabase");
const { loadExtensions, getExtension, listExtensions } = require("./extensions");
const { getHomeFeeds, getSpotlightFeeds, searchAnime, getAnimeById } = require("./providers/anilist");
const {
  getHomeFeedsFallback,
  searchAnimeFallback,
  getAnimeByIdFallback,
} = require("./providers/kitsu");
const { getUserFromRequest } = require("./auth");

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "127.0.0.1";
const FRONTEND_ORIGINS = String(process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const ALLOW_VERCEL_PREVIEWS = String(process.env.ALLOW_VERCEL_PREVIEWS || "").trim() === "1";
const MEDIA_PROXY_ALLOWED_HOSTS = String(process.env.MEDIA_PROXY_ALLOWED_HOSTS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const MEDIA_PROXY_STRICT_MODE =
  String(
    process.env.MEDIA_PROXY_STRICT_MODE || (process.env.NODE_ENV === "production" ? "1" : ""),
  ).trim() === "1";

const app = Fastify({
  logger: true,
  trustProxy: true,
});

const progressSchema = z.object({
  animeId: z.string().min(1),
  episodeId: z.string().min(1),
  provider: z.string().optional(),
  source: z.string().optional(),
  position: z.number().min(0),
  duration: z.number().min(0).optional(),
  completed: z.boolean().optional(),
  animeTitle: z.string().optional(),
  animeCover: z.string().optional(),
  episodeNumber: z.number().int().optional(),
  episodeTitle: z.string().optional(),
});

const favoriteSchema = z.object({
  animeId: z.string().min(1),
  provider: z.string().optional(),
  animeTitle: z.string().optional(),
  animeCover: z.string().optional(),
});

const settingsSchema = z.object({
  sidebarCompact: z.boolean().optional(),
  autoplayNext: z.boolean().optional(),
  preferredSubLang: z.string().optional(),
  uiAnimations: z.boolean().optional(),
});

const trackerConnectSchema = z.object({
  provider: z.string().min(1),
  username: z.string().optional(),
  token: z.string().optional(),
});

function normalizeUrl(url) {
  if (!url) return null;
  const value = String(url);
  if (value.startsWith("//")) return `https:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  return null;
}

function isPrivateHostname(hostname) {
  const host = String(hostname || "").toLowerCase().trim();
  if (!host) return true;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return true;
  if (host.startsWith("10.")) return true;
  if (host.startsWith("192.168.")) return true;
  if (host.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  return false;
}

function isAllowedMediaHost(hostname) {
  const host = String(hostname || "").toLowerCase().trim();
  if (!host || isPrivateHostname(host)) return false;

  if (!MEDIA_PROXY_ALLOWED_HOSTS.length) return !MEDIA_PROXY_STRICT_MODE;

  return MEDIA_PROXY_ALLOWED_HOSTS.some((allowed) => {
    const value = String(allowed || "").toLowerCase().trim();
    if (!value) return false;
    if (value.startsWith("*.")) {
      const suffix = value.slice(1);
      return host.endsWith(suffix);
    }
    return host === value;
  });
}

function validateUrlHost(url, kind = "URL") {
  try {
    const parsed = new URL(String(url || ""));
    if (!isAllowedMediaHost(parsed.hostname)) {
      throw new Error(`${kind} host is not allowed.`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid ${kind.toLowerCase()}.`);
    }
    throw error;
  }
}

async function fetchWithValidatedRedirects(targetUrl, options = {}, maxRedirects = 5) {
  let currentUrl = targetUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      ...options,
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      if (redirectCount >= maxRedirects) {
        throw new Error("Too many upstream redirects.");
      }

      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Upstream redirect missing location header.");
      }

      const nextUrl = new URL(location, currentUrl).toString();
      validateUrlHost(nextUrl, "Redirect URL");
      currentUrl = nextUrl;
      continue;
    }

    return {
      response,
      finalUrl: currentUrl,
    };
  }

  throw new Error("Unable to resolve upstream request.");
}

function toAbsoluteUrl(raw, base) {
  const normalized = normalizeUrl(raw);
  if (normalized) return normalized;
  return new URL(String(raw), base).toString();
}

function buildMediaProxyUrl(baseUrl, targetUrl, opts = {}) {
  const params = new URLSearchParams();
  params.set("url", targetUrl);
  if (opts.referer) params.set("referer", opts.referer);
  if (opts.origin) params.set("origin", opts.origin);
  return `${baseUrl}/api/media?${params.toString()}`;
}

function getRequestBaseUrl(request) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const forwardedHost = String(request.headers["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProto || request.protocol || "http";
  const host = forwardedHost || request.headers.host || `localhost:${PORT}`;
  return `${protocol}://${host}`;
}

function inferSourceFromEpisodeId(episodeId, fallbackSource) {
  const raw = String(episodeId || "");
  if (raw.startsWith("animesalt|")) {
    return "animesalt";
  }
  if (raw.startsWith("allmanga-web|")) {
    return "allmanga-web";
  }
  if (raw.startsWith("gojowtf|")) {
    return "gojowtf";
  }
  const parts = raw.split("|");
  if (parts.length === 3) {
    if (["sub", "dub", "raw"].includes(parts[1])) return "allanime";
    return "kaa-manifest";
  }
  return fallbackSource;
}

function normalizeEpisodeListing(result) {
  if (Array.isArray(result)) {
    return {
      episodes: result,
      translationOptions: [],
      activeTranslation: "",
      optionLabel: "",
      sourceMeta: null,
    };
  }

  return {
    episodes: Array.isArray(result?.episodes) ? result.episodes : [],
    translationOptions: Array.isArray(result?.translationOptions) ? result.translationOptions : [],
    activeTranslation: String(result?.activeTranslation || "").trim().toLowerCase(),
    optionLabel: String(result?.optionLabel || "").trim(),
    sourceMeta:
      result?.sourceMeta && typeof result.sourceMeta === "object" && !Array.isArray(result.sourceMeta)
        ? result.sourceMeta
        : null,
  };
}

function isPlaylist(contentType, url) {
  const ct = String(contentType || "").toLowerCase();
  const target = String(url || "").toLowerCase();
  return (
    ct.includes("application/x-mpegurl") ||
    ct.includes("application/vnd.apple.mpegurl") ||
    ct.includes("audio/mpegurl") ||
    target.includes(".m3u8")
  );
}

function detectContentType(url, upstreamType) {
  const current = String(upstreamType || "").trim().toLowerCase();
  if (current && current !== "application/octet-stream") return upstreamType;

  const lower = String(url || "").toLowerCase();
  if (lower.endsWith(".vtt")) return "text/vtt; charset=utf-8";
  if (lower.endsWith(".srt")) return "application/x-subrip; charset=utf-8";
  if (lower.endsWith(".ass") || lower.endsWith(".ssa")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".m4s")) return "video/iso.segment";
  if (lower.endsWith(".ts")) return "video/mp2t";
  return upstreamType || "application/octet-stream";
}

function rewritePlaylist(text, playlistUrl, backendBase, proxyReferer, proxyOrigin) {
  // Use the original stream referer/origin when available so that upstream
  // CDNs (KAA / krussdomi) receive the correct credentials on every segment
  // request instead of the segment URL's own origin which is often different.
  const segmentReferer = proxyReferer || playlistUrl;
  const segmentOrigin = proxyOrigin || "";

  const lines = String(text).split(/\r?\n/);
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        if (line.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_full, uri) => {
            try {
              const abs = toAbsoluteUrl(uri, playlistUrl);
              const proxied = buildMediaProxyUrl(backendBase, abs, {
                referer: segmentReferer,
                origin: segmentOrigin || new URL(abs).origin,
              });
              return `URI="${proxied}"`;
            } catch {
              return `URI="${uri}"`;
            }
          });
        }
        return line;
      }

      try {
        const abs = toAbsoluteUrl(trimmed, playlistUrl);
        return buildMediaProxyUrl(backendBase, abs, {
          referer: segmentReferer,
          origin: segmentOrigin || new URL(abs).origin,
        });
      } catch {
        return line;
      }
    })
    .join("\n");
}

app.register(cors, {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    try {
      const parsed = new URL(origin);
      const isLocal =
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "[::1]";
      const isConfigured = FRONTEND_ORIGINS.includes(origin);
      const isVercel = ALLOW_VERCEL_PREVIEWS && parsed.hostname.endsWith(".vercel.app");
      callback(null, isLocal || isConfigured || isVercel);
    } catch {
      callback(null, false);
    }
  },
});

app.get("/api/health", async () => {
  return {
    ok: true,
    extensions: listExtensions(),
    settings: await getSettings("local-default"),
  };
});

app.get("/api/extensions", async () => {
  return {
    extensions: listExtensions(),
  };
});

app.get("/api/home", async (_request, reply) => {
  try {
    const feeds = await getHomeFeeds();
    return { ...feeds, source: "anilist" };
  } catch (error) {
    requestLogWarn("AniList home failed, using Kitsu fallback", error);
    try {
      const feeds = await getHomeFeedsFallback();
      return { ...feeds, source: "kitsu" };
    } catch (fallbackError) {
      requestLogWarn("Kitsu fallback failed", fallbackError);
      return reply.code(502).send({ error: "Failed to fetch home feeds." });
    }
  }
});

app.get("/api/home/spotlight", async (_request, reply) => {
  try {
    const feeds = await getSpotlightFeeds();
    return { ...feeds, source: "anilist" };
  } catch (error) {
    requestLogWarn("AniList spotlight failed", error);
    return reply.code(502).send({ error: "Failed to fetch spotlight feeds." });
  }
});

app.get("/api/search", async (request, reply) => {
  const q = String(request.query?.q || "").trim();
  const source = String(request.query?.source || "global").trim().toLowerCase();
  const language = String(request.query?.language || "").trim().toLowerCase();
  const platform = String(request.query?.platform || "").trim().toLowerCase();
  const kind = String(request.query?.kind || "").trim().toLowerCase();
  const page = Math.max(1, Number(request.query?.page || 1) || 1);

  if (source === "animesalt") {
    const ext = getExtension("animesalt");
    if (!ext) {
      return reply.code(404).send({ error: "AnimeSalt source is unavailable." });
    }

    if (q.length < 2 && !language && !platform && !kind) {
      return reply.code(400).send({ error: "Query must be at least 2 characters, or choose an AnimeSalt filter." });
    }

    try {
      const results =
        q.length >= 2
          ? await ext.search(q, { language, platform, kind, page })
          : await ext.browse({ language, platform, kind, page });

      return {
        results,
        source: "animesalt",
      };
    } catch (error) {
      requestLogWarn("AnimeSalt search failed", error);
      return reply.code(502).send({ error: "AnimeSalt search failed." });
    }
  }

  if (q.length < 2) {
    return reply.code(400).send({ error: "Query must be at least 2 characters." });
  }

  try {
    const results = await searchAnime(q);
    return { results, source: "anilist" };
  } catch (error) {
    requestLogWarn("AniList search failed, using Kitsu fallback", error);
    try {
      const results = await searchAnimeFallback(q);
      return { results, source: "kitsu" };
    } catch (fallbackError) {
      requestLogWarn("Kitsu fallback failed", fallbackError);
      return reply.code(502).send({ error: "Search failed." });
    }
  }
});

app.get("/api/discover/:source", async (request, reply) => {
  const source = String(request.params.source || "").trim().toLowerCase();
  const ext = getExtension(source);

  if (!ext || typeof ext.getDiscover !== "function") {
    return reply.code(404).send({ error: "Discover feed not available for this source." });
  }

  try {
    const payload = await ext.getDiscover();
    return {
      source: ext.name,
      ...payload,
    };
  } catch (error) {
    requestLogWarn("Source discover failed", error);
    return reply.code(502).send({ error: "Failed to load source discover feed." });
  }
});

app.get("/api/anime/:id", async (request, reply) => {
  const animeId = decodeURIComponent(String(request.params.id));
  const provider = String(request.query?.provider || "anilist");
  const user = await getUserFromRequest(request, { optional: true });
  const providerExt = getExtension(provider);
  const source = String(request.query?.source || (providerExt ? provider : listExtensions()[0] || "allanime"));
  const requestedTranslation = String(request.query?.translation || "").trim().toLowerCase();
  const ext = getExtension(source);

  if (!ext) {
    return reply.code(404).send({ error: "Extension not found.", extensions: listExtensions() });
  }

  try {
    const fetchStart = Date.now();
    const anime =
      providerExt && typeof providerExt.getAnimeById === "function"
        ? await providerExt.getAnimeById(animeId)
        : provider === "kitsu"
          ? await getAnimeByIdFallback(animeId)
          : await getAnimeById(animeId);
          
    console.log(`[PERF - Backend API] Fetched anime detail from AniList in ${Date.now() - fetchStart}ms`);

    if (!anime) {
      return reply.code(404).send({ error: "Anime not found." });
    }

    let episodes = [];
    let translationOptions = [];
    let activeTranslation = "";
    let optionLabel = "";
    let sourceMeta = null;

    if (!request.query?.source) {
      console.log(`[PERF - Backend API] Bypassing scrape, returning dummy DB map...`);
      const count = typeof anime.episodes === 'number' && anime.episodes > 0 
        ? anime.episodes 
        : (anime?.nextAiringEpisode?.episode ? anime.nextAiringEpisode.episode - 1 : 12);
        
      episodes = Array.from({length: Math.max(1, count)}, (_, i) => ({
        id: `dummy_${i + 1}`,
        number: i + 1,
        title: `Episode ${i + 1}`
      }));
    } else {
      console.log(`[PERF - Backend API] Scraping episodes via ${ext.name}...`);
      const scrapeStart = Date.now();
      try {
        const listing = normalizeEpisodeListing(
          await ext.getEpisodes(anime, {
            translationType: requestedTranslation,
          }),
        );
        episodes = listing.episodes;
        translationOptions = listing.translationOptions;
        activeTranslation = listing.activeTranslation || requestedTranslation;
        optionLabel = listing.optionLabel;
        sourceMeta = listing.sourceMeta;
      } catch (error) {
        requestLogWarn("Extension getEpisodes failed", error);
      }
      console.log(`[PERF - Backend API] Scrape complete in ${Date.now() - scrapeStart}ms`);
    }

    return {
      anime,
      episodes,
      source: ext.name,
      extensions: providerExt ? [providerExt.name] : listExtensions(),
      translationOptions,
      activeTranslation,
      optionLabel,
      sourceMeta,
      provider: anime.provider || provider,
      favorited: user ? await isFavorite(animeId, anime.provider || provider, user.id) : false,
    };
  } catch (error) {
    requestLogWarn("Anime detail fetch failed", error);
    return reply.code(502).send({ error: "Failed to fetch anime detail." });
  }
});

app.get("/api/stream", async (request, reply) => {
  const animeId = decodeURIComponent(String(request.query?.animeId || ""));
  const episodeId = String(request.query?.episodeId || "");
  const provider = String(request.query?.provider || "anilist");
  const requestedSource = String(request.query?.source || "");
  const source = requestedSource || inferSourceFromEpisodeId(episodeId, listExtensions()[0] || "allanime");

  if (!animeId || !episodeId) {
    return reply.code(400).send({ error: "animeId and episodeId are required." });
  }

  const ext = getExtension(source);
  const providerExt = getExtension(provider);
  if (!ext) {
    return reply.code(404).send({ error: "Extension not found.", extensions: listExtensions() });
  }

  try {
    const anime =
      providerExt && typeof providerExt.getAnimeById === "function"
        ? await providerExt.getAnimeById(animeId)
        : provider === "kitsu"
          ? await getAnimeByIdFallback(animeId)
          : await getAnimeById(animeId);
    const stream = await ext.getStream(anime, episodeId);
    if (!stream?.url) {
      return reply.code(404).send({ error: "Stream not found." });
    }

    if (String(stream?.type || "").toLowerCase() === "embed") {
      return {
        source: ext.name,
        stream: {
          ...stream,
          rawUrl: stream.url,
        },
      };
    }

    const backendBase = getRequestBaseUrl(request);
    const referer = stream?.headers?.Referer || stream?.headers?.referer || "";
    const origin = stream?.headers?.Origin || stream?.headers?.origin || "";

    const proxiedStream = {
      ...stream,
      rawUrl: stream.url,
      url: buildMediaProxyUrl(backendBase, stream.url, { referer, origin }),
      subtitles: (stream.subtitles || []).map((sub) => {
        if (!sub?.url) return sub;
        return {
          ...sub,
          rawUrl: sub.url,
          url: buildMediaProxyUrl(backendBase, sub.url, { referer, origin }),
        };
      }),
    };

    return {
      source: ext.name,
      stream: proxiedStream,
    };
  } catch (error) {
    requestLogWarn("Stream resolve failed", error);
    return reply.code(502).send({ error: "Failed to resolve stream." });
  }
});

app.get("/api/media", async (request, reply) => {
  const target = normalizeUrl(request.query?.url);
  const referer = normalizeUrl(request.query?.referer);
  const origin = normalizeUrl(request.query?.origin);

  if (!target) {
    return reply.code(400).send({ error: "Invalid media url." });
  }

  try {
    validateUrlHost(target, "Media URL");
  } catch {
    return reply.code(403).send({ error: "Media host is not allowed." });
  }

  if (referer) {
    try {
      validateUrlHost(referer, "Referer URL");
    } catch {
      return reply.code(403).send({ error: "Referer host is not allowed." });
    }
  }

  if (origin) {
    try {
      validateUrlHost(origin, "Origin URL");
    } catch {
      return reply.code(403).send({ error: "Origin host is not allowed." });
    }
  }

  const headers = {
    Accept: "*/*",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  };
  if (referer) headers.Referer = referer;
  if (origin) headers.Origin = origin;
  if (request.headers.range) headers.Range = request.headers.range;

  // Abort if upstream takes too long — prevents indefinite hangs that
  // cause hls.js to stall on the frontend.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let upstream = null;
  let finalUrl = target;
  try {
    const resolved = await fetchWithValidatedRedirects(target, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    upstream = resolved.response;
    finalUrl = resolved.finalUrl;
  } catch (error) {
    clearTimeout(timeout);
    requestLogWarn("Media fetch failed", error);
    const msg = error?.name === "AbortError" ? "Upstream request timed out." : (error?.message || "Media fetch failed.");
    return reply.code(502).send({ error: msg });
  }

  clearTimeout(timeout);

  if (upstream.status >= 400) {
    const msg = await upstream.text();
    return reply.code(502).send({
      error: "Upstream media error",
      status: upstream.status,
      body: String(msg || "").slice(0, 160),
    });
  }

  const contentType = upstream.headers.get("content-type") || "";
  const backendBase = getRequestBaseUrl(request);

  // CORS — required so hls.js on the frontend can read the response.
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");

  if (isPlaylist(contentType, finalUrl)) {
    const text = await upstream.text();
    // Propagate the original referer/origin through to segment URLs so that
    // CDNs like krussdomi.com receive the correct headers on every request.
    const rewritten = rewritePlaylist(text, finalUrl, backendBase, referer, origin);
    reply
      .code(upstream.status)
      .header("Content-Type", "application/x-mpegURL; charset=utf-8")
      .header("Cache-Control", "no-store")
      .send(rewritten);
    return;
  }

  const raw = Buffer.from(await upstream.arrayBuffer());
  const responseType = detectContentType(finalUrl, contentType);
  reply.code(upstream.status);
  reply.header("Content-Type", responseType);
  reply.header("Cache-Control", "no-store");
  const contentRange = upstream.headers.get("content-range");
  const acceptRanges = upstream.headers.get("accept-ranges");
  if (contentRange) reply.header("Content-Range", contentRange);
  if (acceptRanges) reply.header("Accept-Ranges", acceptRanges);
  reply.header("Content-Length", String(raw.length));
  reply.send(raw);
});

app.post("/api/history/progress", async (request, reply) => {
  let user = null;
  try {
    user = await getUserFromRequest(request);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const parsed = progressSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Invalid progress payload." });
  }

  await saveProgress(parsed.data, user.id);
  return { ok: true };
});

app.get("/api/history/continue", async (request, reply) => {
  let user = null;
  try {
    user = await getUserFromRequest(request);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const limit = Number(request.query?.limit || 24);
  return {
    items: await getContinueWatching(user.id, limit),
  };
});

app.get("/api/history/recent", async (request, reply) => {
  let user = null;
  try {
    user = await getUserFromRequest(request);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const limit = Number(request.query?.limit || 60);
  return {
    items: await getRecentHistory(user.id, limit),
  };
});

app.get("/api/history/:animeId", async (request, reply) => {
  let user = null;
  try {
    user = await getUserFromRequest(request);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const animeId = decodeURIComponent(String(request.params.animeId));
  const provider = String(request.query?.provider || "anilist");
  return {
    items: await getAnimeHistory(user.id, animeId, provider),
  };
});

app.get("/api/history/resume", async (request, reply) => {
  let user = null;
  try {
    user = await getUserFromRequest(request);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const animeId = String(request.query?.animeId || "");
  const episodeId = String(request.query?.episodeId || "");
  const requestedSource = String(request.query?.source || "");
  const source = inferSourceFromEpisodeId(
    episodeId,
    requestedSource || "default",
  );
  const provider = String(request.query?.provider || "anilist");

  if (!animeId || !episodeId) {
    return reply.code(400).send({ error: "animeId and episodeId are required." });
  }

  const item = await getResume(user.id, animeId, episodeId, source, provider);
  return { item };
});

app.get("/api/favorites", async (request, reply) => {
  let user = null;
  try {
    user = await getUserFromRequest(request);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const limit = Number(request.query?.limit || 100);
  return {
    items: await listFavorites(user.id, limit),
  };
});

app.get("/api/favorites/:animeId", async (request, reply) => {
  let user = null;
  try {
    user = await getUserFromRequest(request);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const animeId = decodeURIComponent(String(request.params.animeId || ""));
  const provider = String(request.query?.provider || "anilist");
  return { favorited: await isFavorite(animeId, provider, user.id) };
});

app.post("/api/favorites", async (request, reply) => {
  let user = null;
  try {
    user = await getUserFromRequest(request);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const parsed = favoriteSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Invalid favorite payload." });
  }

  await addFavorite(parsed.data, user.id);
  return { ok: true };
});

app.delete("/api/favorites/:animeId", async (request, reply) => {
  let user = null;
  try {
    user = await getUserFromRequest(request);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const animeId = decodeURIComponent(String(request.params.animeId || ""));
  const provider = String(request.query?.provider || "anilist");
  await removeFavorite(animeId, provider, user.id);
  return { ok: true };
});

app.get("/api/settings", async (request, reply) => {
  let user = null;
  try {
    user = await getUserFromRequest(request);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  return {
    settings: await getSettings(user.id),
    extensions: listExtensions(),
  };
});

app.put("/api/settings", async (request, reply) => {
  let user = null;
  try {
    user = await getUserFromRequest(request);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const parsed = settingsSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Invalid settings payload." });
  }
  await updateSettings(parsed.data, user.id);
  return { ok: true, settings: await getSettings(user.id) };
});

app.get("/api/trackers", async (request, reply) => {
  let user = null;
  try {
    user = await getUserFromRequest(request);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  return {
    items: await listTrackers(user.id),
  };
});

app.post("/api/trackers/connect", async (request, reply) => {
  let user = null;
  try {
    user = await getUserFromRequest(request);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const parsed = trackerConnectSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Invalid tracker payload." });
  }
  await connectTracker(parsed.data, user.id);
  return { ok: true, items: await listTrackers(user.id) };
});

app.delete("/api/trackers/:provider", async (request, reply) => {
  let user = null;
  try {
    user = await getUserFromRequest(request);
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const provider = String(request.params.provider || "").trim();
  if (!provider) {
    return reply.code(400).send({ error: "Provider required." });
  }
  await disconnectTracker(provider, user.id);
  return { ok: true, items: await listTrackers(user.id) };
});

app.setErrorHandler((error, _request, reply) => {
  requestLogWarn("Unhandled server error", error);
  reply.code(500).send({ error: "Internal server error." });
});

function requestLogWarn(message, error) {
  app.log.warn({
    message,
    error: error?.message || String(error),
  });
}

async function start() {
  if (MEDIA_PROXY_STRICT_MODE && !MEDIA_PROXY_ALLOWED_HOSTS.length) {
    app.log.warn({
      message:
        "MEDIA_PROXY_STRICT_MODE is enabled but MEDIA_PROXY_ALLOWED_HOSTS is empty. /api/media will reject all hosts until allowlist is configured.",
    });
  }
  await initDb();
  loadExtensions();
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`MEMO backend running on http://${HOST}:${PORT}`);
}

start().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
