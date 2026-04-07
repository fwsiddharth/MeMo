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
  getDefaultSource,
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

const app = Fastify({
  logger: true,
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
  defaultSource: z.string().optional(),
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

function rewritePlaylist(text, playlistUrl, backendBase) {
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
                referer: playlistUrl,
                origin: new URL(abs).origin,
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
          referer: playlistUrl,
          origin: new URL(abs).origin,
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
      callback(null, isLocal);
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

app.get("/api/anime/:id", async (request, reply) => {
  const animeId = String(request.params.id);
  const provider = String(request.query?.provider || "anilist");
  const user = await getUserFromRequest(request, { optional: true });
  const source = String(request.query?.source || (await getDefaultSource(user?.id || "local-default")));
  const requestedTranslation = String(request.query?.translation || "").trim().toLowerCase();
  const ext = getExtension(source);

  if (!ext) {
    return reply.code(404).send({ error: "Extension not found.", extensions: listExtensions() });
  }

  try {
    const anime =
      provider === "kitsu" ? await getAnimeByIdFallback(animeId) : await getAnimeById(animeId);
    if (!anime) {
      return reply.code(404).send({ error: "Anime not found." });
    }

    let episodes = [];
    let translationOptions = [];
    let activeTranslation = "";
    let optionLabel = "";
    let sourceMeta = null;
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

    return {
      anime,
      episodes,
      source: ext.name,
      extensions: listExtensions(),
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
  const animeId = String(request.query?.animeId || "");
  const episodeId = String(request.query?.episodeId || "");
  const provider = String(request.query?.provider || "anilist");
  const requestedSource = String(request.query?.source || "");
  const user = await getUserFromRequest(request, { optional: true });
  const source = inferSourceFromEpisodeId(
    episodeId,
    requestedSource || (await getDefaultSource(user?.id || "local-default")),
  );

  if (!animeId || !episodeId) {
    return reply.code(400).send({ error: "animeId and episodeId are required." });
  }

  const ext = getExtension(source);
  if (!ext) {
    return reply.code(404).send({ error: "Extension not found.", extensions: listExtensions() });
  }

  try {
    const anime =
      provider === "kitsu" ? await getAnimeByIdFallback(animeId) : await getAnimeById(animeId);
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

    const backendBase = `${request.protocol || "http"}://${request.headers.host || `localhost:${PORT}`}`;
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

  const headers = {
    Accept: "*/*",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  };
  if (referer) headers.Referer = referer;
  if (origin) headers.Origin = origin;
  if (request.headers.range) headers.Range = request.headers.range;

  const upstream = await fetch(target, {
    method: "GET",
    headers,
    redirect: "follow",
  });

  if (upstream.status >= 400) {
    const msg = await upstream.text();
    return reply.code(502).send({
      error: "Upstream media error",
      status: upstream.status,
      body: String(msg || "").slice(0, 160),
    });
  }

  const contentType = upstream.headers.get("content-type") || "";
  const backendBase = `${request.protocol || "http"}://${request.headers.host || `localhost:${PORT}`}`;

  if (isPlaylist(contentType, target)) {
    const text = await upstream.text();
    const rewritten = rewritePlaylist(text, target, backendBase);
    reply
      .code(upstream.status)
      .header("Content-Type", "application/x-mpegURL; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("Access-Control-Allow-Origin", "*")
      .send(rewritten);
    return;
  }

  const raw = Buffer.from(await upstream.arrayBuffer());
  const responseType = detectContentType(target, contentType);
  reply.code(upstream.status);
  reply.header("Content-Type", responseType);
  reply.header("Cache-Control", "no-store");
  reply.header("Access-Control-Allow-Origin", "*");
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
  const animeId = String(request.params.animeId);
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
  const animeId = String(request.params.animeId || "");
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
  const animeId = String(request.params.animeId || "");
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
  await initDb();
  loadExtensions();
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`MEMO backend running on http://${HOST}:${PORT}`);
}

start().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
