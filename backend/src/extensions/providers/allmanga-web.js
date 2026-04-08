const vm = require("vm");

const allAnimeProvider = require("./allanime");

const ALLMANGA_BASE = "https://allmanga.to";
const ALLANIME_API = "https://api.allanime.day/api";
const SEARCH_LIMIT = 24;
const RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
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
  "compilation",
  "recap",
  "side story",
  "reawakening",
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
        availableEpisodes
        episodeCount
        airedStart
        type
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

  const animeFormat = String(anime?.format || "").toUpperCase().trim();
  const showFormat = String(show?.type || "").toUpperCase().trim();
  if (animeFormat && showFormat && animeFormat === showFormat) {
    best += 3;
  }

  if (show?.availableEpisodes?.sub > 0) best += 1;

  if (hasExtraVariantTerm(show, anime)) {
    best -= 18;
  }

  return best;
}

function sortEpisodeStrings(list) {
  return [...(list || [])].sort((left, right) => {
    const leftNum = Number(left);
    const rightNum = Number(right);
    const bothNumeric = Number.isFinite(leftNum) && Number.isFinite(rightNum);
    if (bothNumeric) return leftNum - rightNum;
    return String(left).localeCompare(String(right), undefined, { numeric: true });
  });
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
        throw new Error(`AllManga search HTTP ${response.status}`);
      }

      const json = await response.json();
      if (json.errors?.length) {
        throw new Error(json.errors[0]?.message || "AllManga search error");
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

  throw lastError || new Error("AllManga search request failed.");
}

async function searchAllManga(query) {
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

function mapSearchResult(show) {
  return {
    id: String(show?._id || ""),
    title: show?.englishName || show?.name || show?.nativeName || "Untitled",
    titleEnglish: show?.englishName || show?.name || null,
    titleRomaji: show?.name || show?.englishName || null,
    provider: "allmanga-web",
    episodes: Number(show?.episodeCount) || null,
    seasonYear: Number(show?.airedStart?.year) || null,
  };
}

async function resolveShow(anime) {
  const names = buildQueryVariants(...getAnimeNames(anime));
  const byId = new Map();
  const errors = [];

  for (const name of names) {
    if (name.length < 2) continue;
    try {
      const results = await searchAllManga(name);
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
    throw new Error(errors[0] || "AllManga show not found for this anime.");
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
    throw new Error("No suitable AllManga show match found.");
  }

  return best;
}

function extractNuxtScript(html) {
  const match = String(html || "").match(/<script>\s*window\.__NUXT__=(.*?)<\/script>/s);
  return match?.[1] || null;
}

function extractShowFromNuxtState(state) {
  const fetchEntries = Object.values(state?.fetch || {});
  for (const entry of fetchEntries) {
    if (entry?.show?.availableEpisodesDetail) {
      return entry.show;
    }
  }
  return null;
}

function evaluateNuxtState(scriptSource) {
  const sandbox = {
    window: {},
  };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox.window;

  vm.runInNewContext(`window.__NUXT__=${scriptSource}`, sandbox, {
    timeout: 500,
  });

  return sandbox.window.__NUXT__ || null;
}

async function scrapeShowPage(showId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let response;
  try {
    response = await fetch(`${ALLMANGA_BASE}/bangumi/${encodeURIComponent(showId)}`, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
    });
    clearTimeout(timeout);
  } catch (err) {
    throw new Error(`AllManga page timeout or fetch failed: ${err.message}`);
  }

  if (!response.ok) {
    throw new Error(`AllManga page HTTP ${response.status}`);
  }

  const html = await response.text();
  if (/Page Not Found/i.test(html)) {
    throw new Error("AllManga page not found.");
  }

  const nuxtScript = extractNuxtScript(html);
  if (!nuxtScript) {
    throw new Error("AllManga page data was missing.");
  }

  const state = evaluateNuxtState(nuxtScript);
  const show = extractShowFromNuxtState(state);
  if (!show?._id) {
    throw new Error("AllManga page show payload was missing.");
  }

  return show;
}

function pickTranslationType(show) {
  const detail = show?.availableEpisodesDetail || {};
  if (Array.isArray(detail.sub) && detail.sub.length) return "sub";
  if (Array.isArray(detail.dub) && detail.dub.length) return "dub";
  if (Array.isArray(detail.raw) && detail.raw.length) return "raw";
  return "sub";
}

function buildTranslationOptions(show) {
  const detail = show?.availableEpisodesDetail || {};
  return ["sub", "dub", "raw"].filter((translationType) => Array.isArray(detail[translationType]) && detail[translationType].length);
}

function parseEpisodeId(episodeId) {
  const [prefix, showId, translationType, ...rest] = String(episodeId || "").split("|");
  const episodeString = rest.join("|");
  if (prefix !== "allmanga-web" || !showId || !translationType || !episodeString) {
    return null;
  }
  return { showId, translationType, episodeString };
}

module.exports = {
  name: "allmanga-web",

  async search(query) {
    const results = await searchAllManga(query);
    return results.map(mapSearchResult);
  },

  async getEpisodes(anime, options = {}) {
    const showMatch = await resolveShow(anime);
    const show = await scrapeShowPage(showMatch._id);
    const translationOptions = buildTranslationOptions(show);
    const requestedTranslation = normalizeRequestedTranslation(options.translationType);
    const translationType =
      translationOptions.includes(requestedTranslation) ? requestedTranslation : pickTranslationType(show);
    const episodeStrings = sortEpisodeStrings(show?.availableEpisodesDetail?.[translationType] || []);

    return {
      translationOptions,
      activeTranslation: translationType,
      episodes: episodeStrings.map((episodeString) => ({
        id: `allmanga-web|${show._id}|${translationType}|${episodeString}`,
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
      throw new Error("Invalid AllManga episode id.");
    }

    return allAnimeProvider.getStream(
      _anime,
      `${parsed.showId}|${parsed.translationType}|${parsed.episodeString}`,
    );
  },
};
