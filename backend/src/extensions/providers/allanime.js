const crypto = require("crypto");

const ALLANIME_API = "https://api.allanime.day/api";
const TRANSLATION_PRIORITY = ["sub", "dub", "raw"];
const RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
const SEARCH_LIMIT = 24;
const EXTRA_VARIANT_TERMS = [
  "movie",
  "special",
  "final season",
  "the final chapters",
  "part 2",
  "part 3",
  "season 2",
  "season 3",
  "picture drama",
  "ova",
  "oad",
  "chronicle",
  "lost girls",
  "junior high",
  "no regrets",
];

const SEARCH_QUERY = `
  query(
    $search: SearchInput
    $limit: Int
    $page: Int
    $translationType: VaildTranslationTypeEnumType
    $countryOrigin: VaildCountryOriginEnumType
  ) {
    shows(
      search: $search
      limit: $limit
      page: $page
      translationType: $translationType
      countryOrigin: $countryOrigin
    ) {
      pageInfo {
        total
      }
      edges {
        _id
        name
        englishName
        nativeName
        slugTime
        availableEpisodes
        episodeCount
        airedStart
      }
    }
  }
`;

const SHOW_QUERY = `
  query($_id: String!) {
    show(_id: $_id) {
      _id
      name
      englishName
      nativeName
      availableEpisodes
      availableEpisodesDetail
      episodeCount
      airedStart
      nameOnlyString
    }
  }
`;

const EPISODE_QUERY = `
  query(
    $showId: String!
    $translationType: VaildTranslationTypeEnumType!
    $episodeString: String!
  ) {
    episode(
      showId: $showId
      translationType: $translationType
      episodeString: $episodeString
    ) {
      episodeString
      sourceUrls
      versionFix
      episodeInfo {
        notes
        thumbnails
        uploadDates
      }
    }
  }
`;

function normalizeRequestedTranslation(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["sub", "dub", "raw"].includes(raw)) return raw;
  return "";
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getAnimeNames(anime) {
  return uniqueStrings([
    anime?.titleEnglish,
    anime?.titleRomaji,
    anime?.titleNative,
    anime?.title,
    ...(Array.isArray(anime?.synonyms) ? anime.synonyms : []),
  ]);
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (values || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function scoreNameMatch(candidate, target) {
  if (!candidate || !target) return 0;
  if (candidate === target) return 100;
  if (candidate.startsWith(target) || target.startsWith(candidate)) return 85;
  if (candidate.includes(target) || target.includes(candidate)) return 70;
  return 0;
}

function hasExtraVariantTerm(show, anime) {
  const sourceText = normalizeText(
    [show?.name, show?.englishName, show?.nativeName].filter(Boolean).join(" "),
  );
  const animeText = normalizeText(getAnimeNames(anime).join(" "));

  return EXTRA_VARIANT_TERMS.some((term) => {
    const normalized = normalizeText(term);
    return sourceText.includes(normalized) && !animeText.includes(normalized);
  });
}

function scoreShowMatch(show, anime) {
  const showNames = uniqueStrings([show?.name, show?.englishName, show?.nativeName]).map(normalizeText);
  const animeNames = getAnimeNames(anime).map(normalizeText);

  let best = 0;
  for (const showName of showNames) {
    for (const animeName of animeNames) {
      best = Math.max(best, scoreNameMatch(showName, animeName));
    }
  }

  const animeYear = Number(anime?.seasonYear || anime?.year);
  const airedYear = Number(show?.airedStart?.year);
  if (Number.isFinite(animeYear) && Number.isFinite(airedYear) && animeYear === airedYear) {
    best += 6;
  }

  const animeEpisodes = Number(anime?.episodes);
  const showEpisodes = Number(show?.episodeCount);
  if (Number.isFinite(animeEpisodes) && Number.isFinite(showEpisodes)) {
    if (animeEpisodes === showEpisodes) best += 4;
    else if (Math.abs(animeEpisodes - showEpisodes) <= 2) best += 2;
  }

  if (show?.availableEpisodes?.sub > 0) best += 1;

  if (hasExtraVariantTerm(show, anime)) {
    best -= 18;
  }

  return best;
}

function normalizeSearchQuery(query) {
  const extras = [
    "EXTRA PART",
    "OVA",
    "SPECIAL",
    "RECAP",
    "FINAL SEASON",
    "BONUS",
    "SIDE STORY",
    "PART\\s*\\d+",
    "EPISODE\\s*\\d+",
  ];
  const pattern = new RegExp(`\\b(${extras.join("|")})\\b`, "gi");

  return String(query || "")
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, "$1")
    .replace(/(\d+)\s*Season/gi, "$1")
    .replace(/Season\s*(\d+)/gi, "$1")
    .replace(pattern, "")
    .replace(/-.*?-/g, "")
    .replace(/\bThe(?=\s+Movie\b)/gi, "")
    .replace(/[^a-z0-9\s]+/gi, " ")
    .replace(/~/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildQueryVariants(...values) {
  const variants = [];
  for (const value of values) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    variants.push(raw);

    const normalized = normalizeSearchQuery(raw);
    if (normalized && normalized !== raw) variants.push(normalized);

    const seasonless = raw
      .replace(/\b(\d+)(st|nd|rd|th)\s+season\b/gi, "")
      .replace(/\bseason\s*(\d+)\b/gi, "")
      .replace(/\bpart\s*\d+\b/gi, "")
      .replace(/\b(final season|the final chapters)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (seasonless && seasonless !== raw && seasonless !== normalized) {
      variants.push(seasonless);
      const normalizedSeasonless = normalizeSearchQuery(seasonless);
      if (normalizedSeasonless && normalizedSeasonless !== seasonless) {
        variants.push(normalizedSeasonless);
      }
    }
  }

  return uniqueStrings(variants);
}

async function allAnimeRequest(query, variables = {}) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(ALLANIME_API, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        if (RETRYABLE_STATUSES.has(response.status) && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
          continue;
        }
        throw new Error(`AllAnime HTTP ${response.status}`);
      }

      const json = await response.json();
      if (json.errors?.length) {
        throw new Error(json.errors[0]?.message || "AllAnime error");
      }

      return json.data;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError || new Error("AllAnime request failed.");
}

async function searchAllAnime(query) {
  const data = await allAnimeRequest(SEARCH_QUERY, {
    search: {
      query,
      allowAdult: false,
      allowUnknown: false,
    },
    limit: SEARCH_LIMIT,
    page: 1,
    translationType: "sub",
    countryOrigin: "ALL",
  });

  return Array.isArray(data?.shows?.edges) ? data.shows.edges : [];
}

async function getShowById(showId) {
  const data = await allAnimeRequest(SHOW_QUERY, { _id: showId });
  return data?.show || null;
}

function mapSearchResult(show) {
  const availableEpisodes = show?.availableEpisodes || {};
  const episodeCount = Number(show?.episodeCount) || null;
  const seasonYear = Number(show?.airedStart?.year) || null;

  return {
    id: String(show?._id || ""),
    title: show?.englishName || show?.name || show?.nativeName || "Untitled",
    titleEnglish: show?.englishName || show?.name || null,
    titleRomaji: show?.name || show?.englishName || null,
    provider: "allanime",
    episodes: episodeCount,
    seasonYear,
    availableEpisodes,
  };
}

async function resolveShow(anime) {
  const names = buildQueryVariants(...getAnimeNames(anime));
  const byId = new Map();
  const errors = [];

  for (const name of names) {
    if (name.length < 2) continue;
    try {
      const results = await searchAllAnime(name);
      for (const item of results) {
        if (!item?._id || byId.has(item._id)) continue;
        byId.set(item._id, item);
      }
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }

  const candidates = Array.from(byId.values());
  if (!candidates.length) {
    throw new Error(errors[0] || "AllAnime show not found for this anime.");
  }

  let best = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = scoreShowMatch(candidate, anime);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best?._id) {
    throw new Error("No suitable AllAnime show match found.");
  }

  return best;
}

function sortEpisodeStrings(list) {
  return [...list].sort((left, right) => {
    const leftNum = Number(left);
    const rightNum = Number(right);
    const bothNumeric = Number.isFinite(leftNum) && Number.isFinite(rightNum);
    if (bothNumeric) return leftNum - rightNum;
    return String(left).localeCompare(String(right), undefined, { numeric: true });
  });
}

function pickTranslationType(show) {
  const detail = show?.availableEpisodesDetail || {};
  for (const translationType of TRANSLATION_PRIORITY) {
    if (Array.isArray(detail[translationType]) && detail[translationType].length) {
      return translationType;
    }
  }
  return "sub";
}

function buildTranslationOptions(show) {
  const detail = show?.availableEpisodesDetail || {};
  return TRANSLATION_PRIORITY.filter((translationType) => Array.isArray(detail[translationType]) && detail[translationType].length);
}

function parseEpisodeId(episodeId) {
  const [showId, translationType, ...rest] = String(episodeId || "").split("|");
  const episodeString = rest.join("|");
  if (!showId || !translationType || !episodeString) return null;
  return { showId, translationType, episodeString };
}

function decodeBase64UrlBuffer(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(String(value || "").length / 4) * 4, "=");
  return Buffer.from(normalized, "base64");
}

function decryptBysePlayback(playback) {
  const key = Buffer.concat((playback?.key_parts || []).map(decodeBase64UrlBuffer));
  if (key.length !== 32) {
    throw new Error("Invalid Byse playback key.");
  }

  const iv = decodeBase64UrlBuffer(playback.iv);
  const payload = decodeBase64UrlBuffer(playback.payload);
  const tag = payload.subarray(payload.length - 16);
  const encrypted = payload.subarray(0, payload.length - 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

function buildSubtitles(tracks) {
  if (!Array.isArray(tracks)) return [];
  return tracks
    .map((track) => {
      const url = String(track?.url || "").trim();
      if (!url) return null;
      return {
        lang: String(track?.language || "").trim().toLowerCase() || "en",
        label: String(track?.title || track?.language || "Subtitle").trim(),
        url,
      };
    })
    .filter(Boolean);
}

function detectStreamType(url, mimeType = "") {
  const mime = String(mimeType || "").toLowerCase();
  const target = String(url || "").toLowerCase();
  if (mime.includes("mpegurl") || target.includes(".m3u8")) return "hls";
  return "mp4";
}

async function resolveByseSource(entry, sourceUrl) {
  const match = new URL(sourceUrl).pathname.match(/\/e\/([^/?#]+)/i);
  const code = match?.[1];
  if (!code) {
    throw new Error("Invalid Filemoon embed url.");
  }

  const apiUrl = new URL(`/api/videos/${encodeURIComponent(code)}/embed/playback`, sourceUrl).toString();
  const response = await fetch(apiUrl, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Filemoon playback HTTP ${response.status}`);
  }

  const json = await response.json();
  const playback = json?.playback;
  if (!playback) {
    throw new Error("Filemoon playback payload missing.");
  }

  const data = decryptBysePlayback(playback);
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  if (!sources.length || !sources[0]?.url) {
    throw new Error("Filemoon sources missing.");
  }

  const primary = sources[0];
  return {
    type: detectStreamType(primary.url, primary.mime_type),
    url: primary.url,
    subtitles: buildSubtitles(data?.tracks),
    headers: {
      Referer: sourceUrl,
      Origin: new URL(sourceUrl).origin,
    },
    qualities:
      primary.url.includes(".m3u8")
        ? [{ label: "Auto", value: "auto" }]
        : sources.map((item) => ({
            label: item?.label || item?.quality || "Source",
            value: item?.quality || item?.label || item?.url,
          })),
  };
}

function parseVidnestSources(html) {
  const sourcesMatch = String(html).match(/sources:\s*\[(.*?)\]\s*,\s*(?:image|captions|tracks|title|width|height)/s);
  if (!sourcesMatch) return [];

  const sources = [];
  const regex = /file:\s*"([^"]+)"(?:,label:\s*"([^"]+)")?/g;
  for (const match of sourcesMatch[1].matchAll(regex)) {
    const url = String(match[1] || "").trim();
    if (!url) continue;
    sources.push({
      url,
      label: String(match[2] || "Source").trim(),
    });
  }

  return sources;
}

async function resolveVidnestSource(sourceUrl) {
  const match = new URL(sourceUrl).pathname.match(/\/e\/([^/?#]+)/i);
  const code = match?.[1];
  if (!code) {
    throw new Error("Invalid Vidnest embed url.");
  }

  const response = await fetch("https://vidnest.io/dl", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      op: "embed",
      file_code: code,
      auto: "1",
      referer: "",
    }),
  });

  if (!response.ok) {
    throw new Error(`Vidnest player HTTP ${response.status}`);
  }

  const html = await response.text();
  const sources = parseVidnestSources(html);
  if (!sources.length) {
    throw new Error("Vidnest sources missing.");
  }

  return {
    type: "mp4",
    url: sources[0].url,
    subtitles: [],
    headers: {
      Referer: sourceUrl,
      Origin: "https://vidnest.io",
    },
    qualities: sources.map((item) => ({
      label: item.label || "Source",
      value: item.label || item.url,
    })),
  };
}

function chooseResolver(entry) {
  const sourceUrl = String(entry?.sourceUrl || "").trim();
  if (!sourceUrl.startsWith("http://") && !sourceUrl.startsWith("https://")) {
    return null;
  }

  const url = new URL(sourceUrl);
  const host = url.hostname.toLowerCase();
  const sourceName = String(entry?.sourceName || "").toLowerCase();

  if (host.includes("vidnest.io") || sourceName.includes("vn-hls")) {
    return () => resolveVidnestSource(sourceUrl);
  }

  if (host.includes("bysekoze.com") || sourceName.includes("fm-hls") || sourceName.includes("filemoon")) {
    return () => resolveByseSource(entry, sourceUrl);
  }

  return null;
}

async function resolvePlayableStream(sourceUrls) {
  const sorted = [...(sourceUrls || [])].sort((left, right) => Number(right?.priority || 0) - Number(left?.priority || 0));
  const failures = [];

  for (const entry of sorted) {
    const resolver = chooseResolver(entry);
    if (!resolver) continue;

    try {
      return await resolver();
    } catch (error) {
      failures.push(`${entry?.sourceName || "unknown"}: ${error.message}`);
    }
  }

  throw new Error(failures[0] || "No supported AllAnime stream source was available.");
}

module.exports = {
  name: "allanime",

  async search(query) {
    const results = await searchAllAnime(query);
    return results.map(mapSearchResult);
  },

  async getEpisodes(anime, options = {}) {
    const showMatch = await resolveShow(anime);
    const show = await getShowById(showMatch._id);
    if (!show) {
      throw new Error("AllAnime show detail not found.");
    }

    const translationOptions = buildTranslationOptions(show);
    const requestedTranslation = normalizeRequestedTranslation(options.translationType);
    const translationType =
      translationOptions.includes(requestedTranslation) ? requestedTranslation : pickTranslationType(show);
    const episodeStrings = sortEpisodeStrings(show?.availableEpisodesDetail?.[translationType] || []);

    return {
      translationOptions,
      activeTranslation: translationType,
      episodes: episodeStrings.map((episodeString) => ({
        id: `${show._id}|${translationType}|${episodeString}`,
        number: Number.isFinite(Number(episodeString)) ? Number(episodeString) : undefined,
        title:
          translationType === "sub"
            ? `Episode ${episodeString}`
            : `Episode ${episodeString} (${translationType.toUpperCase()})`,
      })),
    };
  },

  async getStream(_anime, episodeId) {
    const parsed = parseEpisodeId(episodeId);
    if (!parsed) {
      throw new Error("Invalid AllAnime episode id.");
    }

    const data = await allAnimeRequest(EPISODE_QUERY, {
      showId: parsed.showId,
      translationType: parsed.translationType,
      episodeString: parsed.episodeString,
    });

    const sourceUrls = Array.isArray(data?.episode?.sourceUrls) ? data.episode.sourceUrls : [];
    if (!sourceUrls.length) {
      throw new Error("AllAnime episode sources missing.");
    }

    return resolvePlayableStream(sourceUrls);
  },
};
