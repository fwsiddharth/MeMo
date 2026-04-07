const BASE_URL = "https://animesalt.ac";

const LANGUAGE_MAP = {
  hindi: { label: "Hindi", code: "hin" },
  tamil: { label: "Tamil", code: "tam" },
  telugu: { label: "Telugu", code: "tel" },
  bengali: { label: "Bengali", code: "ben" },
  malayalam: { label: "Malayalam", code: "mal" },
  kannada: { label: "Kannada", code: "kan" },
  english: { label: "English", code: "eng" },
  japanese: { label: "Japanese", code: "jpn" },
  korean: { label: "Korean", code: "kor" },
};

const LANGUAGE_PRIORITY = [
  "hindi",
  "tamil",
  "telugu",
  "bengali",
  "malayalam",
  "kannada",
  "english",
  "japanese",
  "korean",
];

const PLATFORM_LABELS = {
  crunchyroll: "Crunchyroll",
  netflix: "Netflix",
  "sony-yay": "Sony YAY",
  "prime-video": "Prime Video",
  "amazon-prime-video": "Prime Video",
  "disney-hotstar": "Disney+ Hotstar",
  "disney-plus-hotstar": "Disney+ Hotstar",
  hotstar: "Disney+ Hotstar",
  disney: "Disney+",
  muse: "Muse",
  "toonami-india": "Toonami India",
  "cartoon-network": "Cartoon Network",
};

const STATUS_LABELS = {
  ongoing: "Ongoing",
  completed: "Completed",
  releasing: "Releasing",
};

function decodeHtmlEntities(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return stripTags(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function getAnimeNames(anime) {
  return uniqueStrings([
    anime?.titleEnglish,
    anime?.titleRomaji,
    anime?.titleNative,
    anime?.title,
    ...(Array.isArray(anime?.synonyms) ? anime.synonyms : []),
  ]);
}

function scoreNameMatch(candidate, target) {
  if (!candidate || !target) return 0;
  if (candidate === target) return 100;
  if (candidate.startsWith(target) || target.startsWith(candidate)) return 85;
  if (candidate.includes(target) || target.includes(candidate)) return 70;
  return 0;
}

function titleCaseLabel(value) {
  return String(value || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mapPlatformLabel(slug) {
  const key = String(slug || "").trim().toLowerCase();
  return PLATFORM_LABELS[key] || titleCaseLabel(key);
}

function mapStatusLabel(slug) {
  const key = String(slug || "").trim().toLowerCase();
  return STATUS_LABELS[key] || titleCaseLabel(key);
}

function buildQueryVariants(...values) {
  const variants = [];
  for (const value of values) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    variants.push(raw);

    const normalized = raw
      .replace(/\b(\d+)(st|nd|rd|th)\b/gi, "$1")
      .replace(/(\d+)\s*Season/gi, "$1")
      .replace(/Season\s*(\d+)/gi, "$1")
      .replace(/[^a-z0-9\s]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (normalized && normalized !== raw) variants.push(normalized);
  }

  return uniqueStrings(variants);
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`AnimeSalt HTTP ${response.status}`);
  }

  return response.text();
}

function parseCategorySlugs(className) {
  return uniqueStrings(
    String(className || "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.startsWith("category-"))
      .map((token) => token.replace(/^category-/, "")),
  );
}

function extractSearchResults(html) {
  const results = [];
  const pattern =
    /<li[^>]+class="([^"]+)"[^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"[\s\S]*?<a href="([^"]+)" class="lnk-blk"><\/a>/gi;

  for (const match of html.matchAll(pattern)) {
    const className = match[1] || "";
    const href = String(match[4] || "").trim();
    if (!href) continue;

    const categories = parseCategorySlugs(className);
    const languages = categories.filter((slug) => Object.hasOwn(LANGUAGE_MAP, slug));
    const platforms = categories.filter((slug) => Object.hasOwn(PLATFORM_LABELS, slug));
    const statuses = categories.filter((slug) => Object.hasOwn(STATUS_LABELS, slug));
    const kind = href.includes("/movies/") ? "movie" : "series";

    results.push({
      id: href.replace(`${BASE_URL}/`, "").replace(/\/+$/, ""),
      title: stripTags(match[2]),
      href,
      kind,
      categories,
      languages,
      platforms,
      statuses,
      coverImage: String(match[3] || "").startsWith("//") ? `https:${String(match[3] || "")}` : String(match[3] || ""),
      provider: "animesalt",
    });
  }

  return results;
}

function scoreShowMatch(entry, anime) {
  const entryName = normalizeText(entry?.title);
  const animeNames = getAnimeNames(anime).map(normalizeText);

  let best = 0;
  for (const animeName of animeNames) {
    best = Math.max(best, scoreNameMatch(entryName, animeName));
  }

  const format = String(anime?.format || "").toUpperCase().trim();
  const wantsMovie = format === "MOVIE";
  if (wantsMovie && entry.kind === "movie") best += 4;
  if (!wantsMovie && entry.kind === "series") best += 4;

  if (entry.languages.includes("hindi")) best += 2;
  if (entry.platforms.length) best += 1;

  return best;
}

async function resolveShow(anime) {
  const names = buildQueryVariants(...getAnimeNames(anime));
  const byHref = new Map();
  const failures = [];

  for (const name of names) {
    if (name.length < 2) continue;
    try {
      const html = await fetchHtml(`${BASE_URL}/?s=${encodeURIComponent(name)}`);
      for (const result of extractSearchResults(html)) {
        if (!result?.href || byHref.has(result.href)) continue;
        byHref.set(result.href, result);
      }
    } catch (error) {
      failures.push(error?.message || String(error));
    }
  }

  const candidates = Array.from(byHref.values());
  if (!candidates.length) {
    throw new Error(failures[0] || "AnimeSalt title not found for this anime.");
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

  if (!best?.href) {
    throw new Error("No suitable AnimeSalt title match found.");
  }

  return best;
}

function parseEpisodeLabel(episodeUrl, fallbackIndex) {
  const slug = String(episodeUrl || "").replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";
  const match = slug.match(/-(\d+)x(\d+)$/i);
  if (!match) {
    return {
      number: fallbackIndex + 1,
      title: `Episode ${fallbackIndex + 1}`,
    };
  }

  const season = Number(match[1]);
  const episode = Number(match[2]);
  return {
    number: fallbackIndex + 1,
    title: `S${season}E${episode}`,
  };
}

function extractEpisodeEntries(html) {
  const entries = [];
  const articlePattern =
    /<article[^>]+class="post dfx fcl episodes[\s\S]*?<a href="([^"]*\/episode\/[^"]+\/)" class="lnk-blk"><\/a>/gi;

  for (const match of html.matchAll(articlePattern)) {
    const episodeUrl = String(match[1] || "").trim();
    if (!episodeUrl) continue;
    entries.push(episodeUrl);
  }

  if (entries.length) return uniqueStrings(entries);

  const smartPattern = /<a href="([^"]*\/episode\/[^"]+\/)" class="smart-play-btn[^"]*">/gi;
  for (const match of html.matchAll(smartPattern)) {
    const episodeUrl = String(match[1] || "").trim();
    if (!episodeUrl) continue;
    entries.push(episodeUrl);
  }

  return uniqueStrings(entries);
}

function pickLanguageOption(languages, requestedLanguage) {
  const list = uniqueStrings(languages);
  const requested = String(requestedLanguage || "").trim().toLowerCase();
  if (requested && list.includes(requested)) return requested;

  for (const preferred of LANGUAGE_PRIORITY) {
    if (list.includes(preferred)) return preferred;
  }

  return list[0] || "hindi";
}

function buildSourceMeta(entry) {
  return {
    languages: entry.languages.map((slug) => LANGUAGE_MAP[slug]?.label || titleCaseLabel(slug)),
    platforms: entry.platforms.map(mapPlatformLabel),
    statuses: entry.statuses.map(mapStatusLabel),
    kind: entry.kind === "movie" ? "Movie" : "Series",
  };
}

function parseEpisodeId(episodeId) {
  const [prefix, seriesSlug, episodeSlug, language, episodeNumber] = String(episodeId || "").split("|");
  if (prefix !== "animesalt" || !seriesSlug || !episodeSlug || !language) return null;

  const parsedNumber = Number(episodeNumber);
  return {
    seriesSlug,
    episodeSlug,
    language,
    episodeNumber: Number.isFinite(parsedNumber) ? parsedNumber : null,
  };
}

function getLanguageCode(language) {
  const key = String(language || "").trim().toLowerCase();
  return LANGUAGE_MAP[key]?.code || "hin";
}

function getLanguageLabel(language) {
  const key = String(language || "").trim().toLowerCase();
  return LANGUAGE_MAP[key]?.label || titleCaseLabel(key);
}

function extractPrimaryEmbedUrl(html) {
  const iframeMatch = String(html).match(
    /<iframe[^>]+src="(https?:\/\/[^"]*as-cdn[^"]+)"[^>]*><\/iframe>/i,
  );
  if (!iframeMatch?.[1]) {
    throw new Error("AnimeSalt embed player was not found for this episode.");
  }
  return iframeMatch[1];
}

module.exports = {
  name: "animesalt",

  async search(query) {
    const html = await fetchHtml(`${BASE_URL}/?s=${encodeURIComponent(query)}`);
    return extractSearchResults(html).map((entry) => ({
      id: entry.id,
      title: entry.title,
      titleEnglish: entry.title,
      titleRomaji: entry.title,
      provider: "animesalt",
      coverImage: entry.coverImage || null,
      languages: entry.languages.map((slug) => LANGUAGE_MAP[slug]?.label || titleCaseLabel(slug)),
      platforms: entry.platforms.map(mapPlatformLabel),
    }));
  },

  async getEpisodes(anime, options = {}) {
    const show = await resolveShow(anime);
    const html = await fetchHtml(show.href);
    const episodeUrls = extractEpisodeEntries(html);
    const translationOptions = uniqueStrings(show.languages);
    const activeTranslation = pickLanguageOption(translationOptions, options.translationType);

    if (!episodeUrls.length) {
      throw new Error("AnimeSalt episode list was empty for this title.");
    }

    return {
      translationOptions,
      activeTranslation,
      optionLabel: "Audio Language",
      sourceMeta: buildSourceMeta(show),
      episodes: episodeUrls.map((episodeUrl, index) => {
        const episodeSlug = episodeUrl.replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";
        const label = parseEpisodeLabel(episodeUrl, index);
        return {
          id: `animesalt|${show.id}|${episodeSlug}|${activeTranslation}|${label.number || index + 1}`,
          number: label.number || index + 1,
          title: label.title,
        };
      }),
    };
  },

  async getStream(_anime, episodeId) {
    const parsed = parseEpisodeId(episodeId);
    if (!parsed) {
      throw new Error("Invalid AnimeSalt episode id.");
    }

    const episodeUrl = `${BASE_URL}/episode/${parsed.episodeSlug}/`;
    const html = await fetchHtml(episodeUrl);
    const embedUrl = extractPrimaryEmbedUrl(html);

    return {
      type: "embed",
      url: embedUrl,
      embedOrigin: new URL(embedUrl).origin,
      audioLanguageCode: getLanguageCode(parsed.language),
      audioLanguageLabel: getLanguageLabel(parsed.language),
      subtitles: [],
      headers: {
        Referer: episodeUrl,
        Origin: BASE_URL,
      },
    };
  },
};
