const base = process.env.BASE_URL || 'http://127.0.0.1:4000';
const provider = process.env.PROVIDER || 'anilist';
const requestedAnimeId = String(process.env.ANIME_ID || '').trim();
const requestedTranslation = String(process.env.TRANSLATION || '').trim();
const sources = String(process.env.SOURCES || 'allanime,allmanga-web,gojowtf,kaa-manifest')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

async function jsonFetch(url) {
  const response = await fetch(url);
  const text = await response.text();
  let body = {};

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  return { ok: response.ok, status: response.status, body };
}

(async () => {
  const report = {};
  let animeId = requestedAnimeId;

  if (!animeId) {
    const home = await jsonFetch(`${base}/api/home`);

    if (!home.ok) {
      report.error = 'home_failed';
      report.home = home;
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    const anime = [...(home.body.trending || []), ...(home.body.popular || [])].find(
      (item) => item && item.id,
    );

    if (!anime) {
      report.error = 'no_anime';
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    animeId = String(anime.id);
  }

  report.animeId = animeId;
  report.baseUrl = base;
  report.provider = provider;
  report.translation = requestedTranslation;
  report.sourceAttempts = [];
  report.successes = [];
  report.sources = sources;

  for (const source of sources) {
    const detailQuery = new URLSearchParams();
    detailQuery.set('provider', provider);
    detailQuery.set('source', source);
    if (requestedTranslation) detailQuery.set('translation', requestedTranslation);

    const detailUrl = `${base}/api/anime/${encodeURIComponent(animeId)}?${detailQuery.toString()}`;
    const detail = await jsonFetch(detailUrl);
    const episodes = detail.body?.episodes || [];

    const attempt = {
      source,
      detailStatus: detail.status,
      episodes: episodes.length,
    };

    if (!detail.ok || !episodes.length) {
      report.sourceAttempts.push(attempt);
      continue;
    }

    const episode = episodes[0];
    attempt.episodeId = episode.id;

    const streamUrl = `${base}/api/stream?animeId=${encodeURIComponent(animeId)}&provider=${encodeURIComponent(provider)}&source=${encodeURIComponent(source)}&episodeId=${encodeURIComponent(String(episode.id))}`;
    const stream = await jsonFetch(streamUrl);
    attempt.streamStatus = stream.status;

    if (!stream.ok) {
      attempt.streamError = stream.body?.error || stream.body;
      report.sourceAttempts.push(attempt);
      continue;
    }

    const streamData = stream.body?.stream || {};
    attempt.streamType = streamData.type || 'unknown';
    attempt.proxiedUrl = streamData.url || '';
    attempt.rawUrl = streamData.rawUrl || '';

    if (String(streamData.type || '').toLowerCase() === 'embed') {
      attempt.mediaProbe = 'skipped_embed';
      report.sourceAttempts.push(attempt);
      report.successes.push(attempt);
      continue;
    }

    const mediaResponse = await fetch(streamData.url, { method: 'GET' });
    const mediaText = await mediaResponse.text().catch(() => '');

    attempt.mediaStatus = mediaResponse.status;
    attempt.mediaErrorSnippet = mediaResponse.ok ? '' : String(mediaText || '').slice(0, 180);

    report.sourceAttempts.push(attempt);

    if (mediaResponse.ok) {
      report.successes.push(attempt);
    }
  }

  report.summary = {
    totalSources: sources.length,
    successfulSources: report.successes.length,
    failedSources: sources.length - report.successes.length,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.successes.length > 0 ? 0 : 2);
})();
