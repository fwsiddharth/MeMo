const MANIFEST_URL =
  process.env.KAA_MANIFEST_URL ||
  "https://raw.githubusercontent.com/Thekingcrusher/online-stream-providers/refs/heads/main/kaa/manifest.json";

const MANIFEST_TTL_MS = 30 * 60 * 1000;

let manifestCache = null;

function decodeHtmlEntities(value) {
  return String(value || "")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'");
}

function resolveUrl(url, baseUrl = "") {
  if (!url) return null;
  let value = String(url).trim();
  value = value.replace(/^https:\/\/\/+/i, "https://");
  value = value.replace(/^http:\/\/\/+/i, "http://");
  if (value.startsWith("//")) return `https:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  try {
    if (baseUrl) return new URL(value, baseUrl).toString();
  } catch {
    // fall through
  }
  return `https://${value.replace(/^\/+/, "")}`;
}

function normalizeLangCode(lang) {
  const value = String(lang || "").toLowerCase().trim();
  if (!value) return "en";
  if (value === "eng") return "en";
  if (value === "jpn") return "ja";
  if (value === "spa") return "es";
  if (value === "por") return "pt";
  return value;
}

function normalizedText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreMatch(result, candidateNames) {
  const title = normalizedText(result?.title_en || result?.title || "");
  if (!title) return 0;

  let best = 0;
  for (const rawName of candidateNames) {
    const name = normalizedText(rawName);
    if (!name) continue;
    if (title === name) best = Math.max(best, 100);
    else if (title.startsWith(name) || name.startsWith(title)) best = Math.max(best, 85);
    else if (title.includes(name) || name.includes(title)) best = Math.max(best, 70);
  }

  if ((result?.locales || []).includes("ja-JP")) best += 3;
  if ((result?.locales || []).includes("en-US")) best += 2;
  return best;
}

function pickPreferredLanguage(languages) {
  if (!Array.isArray(languages) || !languages.length) return "ja-JP";
  if (languages.includes("zh-CN")) return "zh-CN";
  if (languages.includes("ja-JP")) return "ja-JP";
  return languages[0];
}

function parseEpisodeId(episodeId) {
  const raw = String(episodeId || "");
  const split = raw.split("|");
  if (split.length === 3) {
    const [showSlug, episodeString, epSlug] = split;
    return { showSlug, episodeString, epSlug };
  }
  return null;
}

function pickServer(servers, preferredServers = []) {
  const list = Array.isArray(servers) ? servers : [];
  if (!list.length) return null;

  for (const preferred of preferredServers) {
    const found = list.find(
      (server) => String(server?.name || "").toLowerCase().trim() === String(preferred).toLowerCase().trim(),
    );
    if (found) return found;
  }

  return list[0];
}

function extractStreamFromPlayerHtml(html, playerUrl) {
  const propsMatch = String(html).match(/<astro-island[^>]+props="([^"]+)"/i);
  if (!propsMatch) return { manifestUrl: null, subtitles: [] };

  const propsRaw = decodeHtmlEntities(propsMatch[1]);
  const props = JSON.parse(propsRaw);

  const manifestRaw = Array.isArray(props?.manifest) ? props.manifest[1] : props?.manifest;
  const manifestUrl = resolveUrl(manifestRaw, playerUrl);

  const subtitlesRaw = Array.isArray(props?.subtitles) ? props.subtitles[1] : props?.subtitles;
  const subtitles = [];
  if (Array.isArray(subtitlesRaw)) {
    for (const entry of subtitlesRaw) {
      const item = Array.isArray(entry) ? entry[1] : entry;
      if (!item || typeof item !== "object") continue;

      const lang = Array.isArray(item.language) ? item.language[1] : item.language;
      const label = Array.isArray(item.name) ? item.name[1] : item.name;
      const src = resolveUrl(Array.isArray(item.src) ? item.src[1] : item.src, playerUrl);
      if (!src) continue;

      subtitles.push({
        lang: normalizeLangCode(lang),
        label: String(label || lang || "Subtitle"),
        url: src,
      });
    }
  }

  return { manifestUrl, subtitles };
}

function parsePreferredServersFromPayload(payload) {
  const payloadText = String(payload || "");
  const match = payloadText.match(/episodeServers\s*:\s*\[([^\]]+)\]/);
  if (!match) return ["VidStreaming", "CatStream"];

  return match[1]
    .split(",")
    .map((x) => x.trim().replace(/^["'`]|["'`]$/g, ""))
    .filter(Boolean);
}

async function getManifestConfig() {
  const now = Date.now();
  if (manifestCache && manifestCache.expiresAt > now) {
    return manifestCache.value;
  }

  const response = await fetch(MANIFEST_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`KAA manifest HTTP ${response.status}`);
  }
  const json = await response.json();

  const payloadText = String(json?.payload || "");
  const baseMatch = payloadText.match(/base\s*=\s*["'`](https?:\/\/[^"'`]+)["'`]/);
  const base = baseMatch?.[1] || "https://kaa.lt";
  const preferredServers = parsePreferredServersFromPayload(payloadText);

  const value = {
    name: json?.name || "KickAssAnime",
    base,
    preferredServers,
  };

  manifestCache = {
    value,
    expiresAt: now + MANIFEST_TTL_MS,
  };
  return value;
}

async function searchKaa(query) {
  const config = await getManifestConfig();
  const response = await fetch(`${config.base}/api/fsearch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, page: 1 }),
  });

  if (!response.ok) {
    throw new Error(`KAA search HTTP ${response.status}`);
  }

  const json = await response.json();
  return Array.isArray(json?.result) ? json.result : [];
}

async function resolveShow(anime) {
  const names = [
    anime?.titleEnglish,
    anime?.titleRomaji,
    anime?.title,
  ].filter(Boolean);

  let candidates = [];
  for (const name of names) {
    const q = String(name).trim();
    if (q.length < 2) continue;
    const result = await searchKaa(q);
    candidates = candidates.concat(result);
  }

  if (!candidates.length) {
    throw new Error("KAA show not found for this anime.");
  }

  let best = null;
  let bestScore = -1;
  for (const item of candidates) {
    const score = scoreMatch(item, names);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  if (!best || !best.slug) {
    throw new Error("No suitable KAA show match found.");
  }

  return best;
}

async function getAllEpisodes(config, showSlug, language) {
  const base = `${config.base}/api/show/${showSlug}/episodes?ep=1&lang=${encodeURIComponent(language)}`;
  const firstRes = await fetch(`${base}&page=1`);
  if (!firstRes.ok) {
    throw new Error(`KAA episodes HTTP ${firstRes.status}`);
  }

  const firstData = await firstRes.json();
  const pages = Array.isArray(firstData?.pages) ? firstData.pages : [];
  const pageNumbers = pages
    .map((p) => Number(p?.number))
    .filter((n) => Number.isFinite(n) && n > 1);

  const all = Array.isArray(firstData?.result) ? [...firstData.result] : [];
  const rest = await Promise.all(
    pageNumbers.map(async (pageNo) => {
      const res = await fetch(`${base}&page=${pageNo}`);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.result) ? json.result : [];
    }),
  );

  for (const list of rest) all.push(...list);
  return all
    .filter((ep) => Number.isInteger(ep?.episode_number))
    .sort((a, b) => Number(a.episode_number) - Number(b.episode_number));
}

module.exports = {
  name: "kaa-manifest",

  async search(query) {
    return searchKaa(query);
  },

  async getEpisodes(anime) {
    const config = await getManifestConfig();
    const show = await resolveShow(anime);

    const langRes = await fetch(`${config.base}/api/show/${show.slug}/language`);
    if (!langRes.ok) {
      throw new Error(`KAA language HTTP ${langRes.status}`);
    }
    const langJson = await langRes.json();
    const language = pickPreferredLanguage(langJson?.result);

    const episodes = await getAllEpisodes(config, show.slug, language);
    return {
      translationOptions: ["sub"],
      activeTranslation: "sub",
      episodes: episodes.map((ep) => {
        const episodeString = String(ep.episode_string || ep.episode_number);
        return {
          id: `${show.slug}|${episodeString}|${ep.slug}`,
          number: ep.episode_number,
          title: ep.title || `Episode ${episodeString}`,
        };
      }),
    };
  },

  async getStream(_anime, episodeId) {
    const config = await getManifestConfig();
    const parsed = parseEpisodeId(episodeId);
    if (!parsed) {
      throw new Error("Invalid episode id for KAA source.");
    }

    const epKey = `ep-${parsed.episodeString}-${parsed.epSlug}`;
    const epRes = await fetch(`${config.base}/api/show/${parsed.showSlug}/episode/${epKey}`);
    if (!epRes.ok) {
      throw new Error(`KAA episode HTTP ${epRes.status}`);
    }

    const epData = await epRes.json();
    const server = pickServer(epData?.servers, config.preferredServers);
    if (!server?.src) {
      throw new Error("No server available for this episode.");
    }

    const playerUrl = String(server.src).replace("vast", "player");
    const playerRes = await fetch(playerUrl);
    if (!playerRes.ok) {
      throw new Error(`KAA player HTTP ${playerRes.status}`);
    }

    const html = await playerRes.text();
    const { manifestUrl, subtitles } = extractStreamFromPlayerHtml(html, playerUrl);
    if (!manifestUrl) {
      throw new Error("Stream manifest not found in player page.");
    }

    return {
      type: "hls",
      url: manifestUrl,
      subtitles,
      headers: {
        Referer: playerUrl,
        Origin: "https://krussdomi.com",
      },
      qualities: [{ label: "Auto", value: "auto" }],
    };
  },
};
