import Link from "next/link";
import VideoPlayer from "../../../../components/VideoPlayer";
import EpisodeSidebar from "../../../../components/EpisodeSidebar";
import PlayerControlBar from "../../../../components/PlayerControlBar";
import FavoriteButton from "../../../../components/FavoriteButton";
import { apiFetch, stripHtml } from "../../../../lib/api";
import { requireServerSession } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

function inferTranslationFromEpisodeId(episodeId) {
  const raw = String(episodeId || "");
  if (raw.startsWith("animesalt|")) return raw.split("|")[3] || "";
  if (raw.startsWith("allmanga-web|")) return raw.split("|")[2] || "";
  if (raw.startsWith("gojowtf|")) return raw.split("|")[3] || "";
  const parts = raw.split("|");
  if (parts.length === 3 && ["sub", "dub", "raw"].includes(parts[1]))
    return parts[1];
  return "";
}

function sortEpisodes(items = []) {
  return [...items].sort(
    (a, b) => Number(a.number || 0) - Number(b.number || 0),
  );
}

function pickEpisodeForSource(episodes, routeEpisodeId, targetEpisodeNumber) {
  if (!Array.isArray(episodes) || !episodes.length) return null;

  if (targetEpisodeNumber > 0) {
    const byNumber = episodes.find(
      (item) => Number(item.number || 0) === Number(targetEpisodeNumber),
    );
    if (byNumber) return byNumber;
  }

  if (routeEpisodeId && routeEpisodeId !== "_") {
    const byId = episodes.find(
      (item) => String(item.id) === String(routeEpisodeId),
    );
    if (byId) return byId;
  }

  return episodes[0] || null;
}

function buildEpisodeHref({
  animeId,
  provider,
  source,
  translation,
  animeTitle,
  animeCover,
  episodes,
  episode,
}) {
  if (!episode?.id) return "";

  const encodedAnimeId = encodeURIComponent(String(animeId || ""));
  const currentIndex = episodes.findIndex((item) => item.id === episode.id);
  const nextEpisode =
    currentIndex >= 0 ? episodes[currentIndex + 1] || null : null;

  const query = new URLSearchParams();
  query.set("provider", String(provider || "anilist"));
  if (source) query.set("source", String(source));
  query.set("manualSource", "1");
  if (translation) query.set("translation", String(translation));
  query.set("ep", String(episode.number || ""));
  query.set("title", String(episode.title || ""));
  query.set("animeTitle", String(animeTitle || ""));
  query.set("cover", String(animeCover || ""));

  if (nextEpisode?.id) {
    query.set("nextEpisodeId", String(nextEpisode.id));
    query.set("nextEpisodeNumber", String(nextEpisode.number || ""));
    query.set("nextEpisodeTitle", String(nextEpisode.title || ""));
  }

  return `/player/${encodedAnimeId}/${encodeURIComponent(String(episode.id))}?${query.toString()}`;
}

function formatAiringDate(airingAt) {
  if (!airingAt) return "";
  const date = new Date(Number(airingAt) * 1000);
  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export default async function PlayerPage({ params, searchParams }) {
  const session = await requireServerSession();
  const authHeaders = { Authorization: `Bearer ${session.access_token}` };

  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  const animeId = decodeURIComponent(resolvedParams.animeId);
  const encodedAnimeId = encodeURIComponent(animeId);
  const routeEpisodeId = decodeURIComponent(resolvedParams.episodeId);

  const provider = String(resolvedSearchParams?.provider || "anilist");
  const requestedSource = String(
    resolvedSearchParams?.source || "",
  ).trim();
  const queryTranslation = String(
    resolvedSearchParams?.translation ||
      inferTranslationFromEpisodeId(routeEpisodeId),
  );
  const queryEpisodeNumber = Number(resolvedSearchParams?.ep || 0);
  const queryEpisodeTitle = String(resolvedSearchParams?.title || "");
  const queryAnimeTitle = String(resolvedSearchParams?.animeTitle || "");
  const queryAnimeCover = String(resolvedSearchParams?.cover || "");

  let settingsRes = { settings: {} };
  let extensionsRes = { extensions: [] };
  let detailRes = null;
  let historyRes = { items: [] };
  let stream = null;
  let resolvedEpisodeId = routeEpisodeId;
  let resumeAt = 0;
  let activeTranslation = queryTranslation;
  let loadError = "";

  try {
    const startMs = Date.now();
    console.log(`[PERF - Player] Start loading player page for ${animeId}...`);

    [settingsRes, extensionsRes] = await Promise.all([
      apiFetch("/api/settings", { headers: authHeaders }),
      apiFetch("/api/extensions", { headers: authHeaders }),
    ]);
    console.log(`[PERF - Player] Ext/Settings loaded in ${Date.now() - startMs}ms`);

    const detailQuery = new URLSearchParams();
    detailQuery.set("provider", provider);
    if (requestedSource) detailQuery.set("source", requestedSource);
    if (queryTranslation) detailQuery.set("translation", queryTranslation);

    const detailStart = Date.now();
    detailRes = await apiFetch(
      `/api/anime/${encodedAnimeId}?${detailQuery.toString()}`,
      { headers: authHeaders },
    );
    console.log(`[PERF - Player] Anime Detail (/api/anime/:id) loaded in ${Date.now() - detailStart}ms`);

    if (requestedSource) {
      const episodes = sortEpisodes(detailRes?.episodes || []);
      const selectedEpisode = pickEpisodeForSource(
        episodes,
        routeEpisodeId,
        queryEpisodeNumber,
      );

      if (selectedEpisode?.id) {
        resolvedEpisodeId = String(selectedEpisode.id);
        const streamStart = Date.now();
        const streamRes = await apiFetch(
          `/api/stream?animeId=${encodeURIComponent(animeId)}&provider=${encodeURIComponent(provider)}&episodeId=${encodeURIComponent(resolvedEpisodeId)}&source=${encodeURIComponent(requestedSource)}`,
          { headers: authHeaders },
        );
        console.log(`[PERF - Player] Stream (/api/stream) loaded in ${Date.now() - streamStart}ms`);
        stream = streamRes?.stream || null;
      }

      activeTranslation = String(
        detailRes?.activeTranslation || queryTranslation || "",
      );
    }

    const historyStart = Date.now();
    historyRes = await apiFetch(
      `/api/history/${encodedAnimeId}?provider=${encodeURIComponent(provider)}`,
      { headers: authHeaders },
    );
    console.log(`[PERF - Player] History loaded in ${Date.now() - historyStart}ms`);
    console.log(`[PERF - Player] Total Time: ${Date.now() - startMs}ms`);

    if (
      requestedSource &&
      resolvedEpisodeId &&
      resolvedEpisodeId !== "_" &&
      stream
    ) {
      const resumeRes = await apiFetch(
        `/api/history/resume?animeId=${encodeURIComponent(animeId)}&provider=${encodeURIComponent(provider)}&episodeId=${encodeURIComponent(resolvedEpisodeId)}&source=${encodeURIComponent(requestedSource)}`,
        { headers: authHeaders },
      );
      resumeAt = Number(resumeRes?.item?.position || 0);
    }
  } catch (error) {
    loadError = error.message || "Failed to load player.";
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Player</h1>
        <p className="rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
          {loadError}
        </p>
      </div>
    );
  }

  const anime = detailRes?.anime || {};
  const episodes = sortEpisodes(detailRes?.episodes || []);
  const playerDefaults = settingsRes?.settings || {};
  const historyItems = historyRes?.items || [];
  const availableSources = [
    requestedSource,
    ...(detailRes?.extensions || []),
    ...(extensionsRes?.extensions || []),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);

  const currentEpisode = episodes.find(
    (item) => String(item.id) === String(resolvedEpisodeId),
  ) || {
    id: resolvedEpisodeId,
    number: queryEpisodeNumber,
    title: queryEpisodeTitle,
  };

  const currentIndex = episodes.findIndex(
    (item) => item.id === currentEpisode.id,
  );

  const prevEpisodeObj = currentIndex > 0 ? episodes[currentIndex - 1] : null;
  const nextEpisodeObj =
    currentIndex >= 0 && currentIndex < episodes.length - 1
      ? episodes[currentIndex + 1]
      : null;

  const buildNavHref = (episode) =>
    buildEpisodeHref({
      animeId,
      provider,
      source: requestedSource || (availableSources[0] || ""),
      translation: activeTranslation,
      animeTitle: anime?.title || queryAnimeTitle,
      animeCover: anime?.coverImage || queryAnimeCover,
      episodes,
      episode,
    });

  const nextEpisodeHref = nextEpisodeObj ? buildNavHref(nextEpisodeObj) : "";
  const prevEpisodeHref = prevEpisodeObj ? buildNavHref(prevEpisodeObj) : "";

  // Build history lookup
  const historyByEpisode = new Map();
  for (const item of historyItems) {
    if (!item?.episodeId) continue;
    const existing = historyByEpisode.get(item.episodeId);
    if (
      !existing ||
      Number(item.updatedAt || 0) > Number(existing.updatedAt || 0)
    ) {
      historyByEpisode.set(item.episodeId, item);
    }
  }

  const watchedIds = Array.from(historyByEpisode.entries())
    .filter(([, item]) => item?.completed)
    .map(([id]) => id);

  // Pre-build episode hrefs for sidebar
  const episodesForSidebar = episodes.map((ep) => ({
    id: String(ep.id),
    number: ep.number || "?",
    title: ep.title || "",
    href: buildEpisodeHref({
      animeId,
      provider,
      source: requestedSource || (availableSources[0] || ""),
      translation: activeTranslation,
      animeTitle: anime?.title || queryAnimeTitle,
      animeCover: anime?.coverImage || queryAnimeCover,
      episodes,
      episode: ep,
    }),
  }));

  const playerEpisodeId =
    currentEpisode?.id && currentEpisode.id !== "_"
      ? currentEpisode.id
      : routeEpisodeId;

  const displayTitle = anime?.title || queryAnimeTitle || "Anime";
  const displayCover = anime?.coverImage || queryAnimeCover;
  const displayFormat = anime?.format || "TV";

  return (
    <div className="space-y-4 pb-6">
      {/* ── Breadcrumb ────────────────────────────────── */}
      <nav className="text-sm text-zinc-400">
        <Link href="/" className="transition hover:text-zinc-200">
          Home
        </Link>
        <span className="mx-1.5 text-zinc-600">·</span>
        <span>{displayFormat}</span>
        <span className="mx-1.5 text-zinc-600">·</span>
        <span className="text-zinc-200">Watching {displayTitle}</span>
      </nav>

      {/* ── Main 3-column layout ──────────────────────── */}
      <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_280px] xl:max-w-[1700px] xl:mx-auto">
        {/* ╔═══════════════════════════════════════════════
           ║  LEFT — Episode Sidebar
           ╚═══════════════════════════════════════════════ */}
        {episodes.length ? (
          <EpisodeSidebar
            episodes={episodesForSidebar}
            currentEpisodeId={String(currentEpisode.id)}
            watchedIds={watchedIds}
            className="sticky top-20 xl:h-[calc(100vh-100px)] overflow-hidden"
          />
        ) : (
          <aside className="flex h-60 items-center justify-center rounded-xl border border-zinc-800/60 bg-[#141422]/90 p-4 xl:sticky xl:top-20">
            <p className="text-center text-xs text-zinc-500">
              No episodes available.
            </p>
          </aside>
        )}

        {/* ╔═══════════════════════════════════════════════
           ║  CENTER — Player + controls + servers
           ╚═══════════════════════════════════════════════ */}
        <div className="space-y-3">
          {/* Video Player */}
          <div className="overflow-hidden rounded-xl border border-zinc-800/60 bg-black">
            {requestedSource && stream ? (
              <VideoPlayer
                stream={stream}
                animeId={animeId}
                provider={provider}
                episodeId={resolvedEpisodeId}
                source={requestedSource}
                animeTitle={anime?.title || queryAnimeTitle}
                animeCover={anime?.coverImage || queryAnimeCover}
                episodeNumber={Number(currentEpisode.number || 0)}
                episodeTitle={String(currentEpisode.title || "")}
                resumeAt={resumeAt}
                nextEpisodeHref={nextEpisodeHref}
                preferredSubLang={String(
                  playerDefaults.preferredSubLang || "en",
                )}
                autoplayNextDefault={Boolean(playerDefaults.autoplayNext)}
              />
            ) : (
              <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-black via-zinc-950 to-black">
                <div className="space-y-3 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800/60">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="white"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-zinc-300">
                    {requestedSource
                      ? "No stream available for this episode"
                      : "Select a server below to start watching"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Toggle Bar: Auto Play / Skip Intro / Auto Next + Prev/Next */}
          <PlayerControlBar
            prevEpisodeHref={prevEpisodeHref}
            nextEpisodeHref={nextEpisodeHref}
          />

          {/* ── Server Selector Panel ───────────────────── */}
          <section className="overflow-hidden rounded-xl border border-zinc-800/60">
            <div className="grid md:grid-cols-[220px_1fr]">
              {/* Red info panel */}
              <div className="flex items-center justify-center bg-gradient-to-br from-red-600 to-red-700 px-5 py-5 text-center text-white">
                <div className="space-y-1.5">
                  <p className="text-[13px] font-medium leading-tight text-red-100">
                    You are watching
                  </p>
                  <p className="text-lg font-bold leading-tight">
                    Episode {currentEpisode.number || "?"}
                  </p>
                  <p className="text-[11px] leading-snug text-red-200/80">
                    If the current server doesn&apos;t work, please try other
                    servers beside.
                  </p>
                </div>
              </div>

              {/* Server buttons */}
              <div className="space-y-4 bg-[#141422]/90 p-4">
                {/* SUB row */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex w-12 items-center gap-1.5 text-sm font-bold text-zinc-300">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    SUB:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {availableSources.length ? (
                      availableSources.map((sourceName) => {
                        const qSub = new URLSearchParams();
                        qSub.set("provider", provider);
                        qSub.set("source", sourceName);
                        qSub.set("manualSource", "1");
                        if (activeTranslation)
                          qSub.set("translation", "sub");
                        qSub.set(
                          "ep",
                          String(
                            currentEpisode?.number ||
                              queryEpisodeNumber ||
                              "",
                          ),
                        );
                        qSub.set(
                          "title",
                          String(
                            currentEpisode?.title || queryEpisodeTitle || "",
                          ),
                        );
                        qSub.set(
                          "animeTitle",
                          String(anime?.title || queryAnimeTitle || ""),
                        );
                        qSub.set(
                          "cover",
                          String(
                            anime?.coverImage || queryAnimeCover || "",
                          ),
                        );

                        const subHref = `/player/${encodedAnimeId}/${encodeURIComponent(String(playerEpisodeId || "_"))}?${qSub.toString()}`;
                        const displayNames = {
                          "allanime": "All Anime",
                          "allmanga-web": "All Manga",
                          "animesalt": "Animesalt",
                          "gojowtf": "Gojo",
                          "kaa-manifest": "kickAss"
                        };
                        const isActive = sourceName === requestedSource && (!activeTranslation || activeTranslation === "sub");

                        return (
                          <Link
                            key={`sub-${sourceName}`}
                            href={subHref}
                            className={`rounded-lg px-5 py-1.5 text-[13px] font-semibold transition ${
                              isActive
                                ? "bg-red-600 text-white shadow-md shadow-red-900/30"
                                : "bg-zinc-700/80 text-zinc-300 hover:bg-zinc-600"
                            }`}
                          >
                            {displayNames[sourceName] || sourceName}
                          </Link>
                        );
                      })
                    ) : (
                      <span className="text-xs text-zinc-500">
                        No servers available
                      </span>
                    )}
                  </div>
                </div>

                {/* DUB row */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex w-12 items-center gap-1.5 text-sm font-bold text-zinc-300">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    DUB:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {availableSources.length ? (
                      availableSources.map((sourceName) => {
                        const qDub = new URLSearchParams();
                        qDub.set("provider", provider);
                        qDub.set("source", sourceName);
                        qDub.set("manualSource", "1");
                        qDub.set("translation", "dub");
                        qDub.set(
                          "ep",
                          String(
                            currentEpisode?.number ||
                              queryEpisodeNumber ||
                              "",
                          ),
                        );
                        qDub.set(
                          "title",
                          String(
                            currentEpisode?.title || queryEpisodeTitle || "",
                          ),
                        );
                        qDub.set(
                          "animeTitle",
                          String(anime?.title || queryAnimeTitle || ""),
                        );
                        qDub.set(
                          "cover",
                          String(
                            anime?.coverImage || queryAnimeCover || "",
                          ),
                        );

                        const dubHref = `/player/${encodedAnimeId}/${encodeURIComponent(String(playerEpisodeId || "_"))}?${qDub.toString()}`;
                        const displayNames = {
                          "allanime": "All Anime",
                          "allmanga-web": "All Manga",
                          "animesalt": "Animesalt",
                          "gojowtf": "Gojo",
                          "kaa-manifest": "kickAss"
                        };

                        return (
                          <Link
                            key={`dub-${sourceName}`}
                            href={dubHref}
                            className={`rounded-lg px-5 py-1.5 text-[13px] font-semibold transition ${
                               sourceName === requestedSource && activeTranslation === "dub"
                                ? "bg-amber-500 text-black shadow-md shadow-amber-900/40"
                                : "bg-zinc-700/80 text-zinc-300 hover:bg-zinc-600"
                            }`}
                          >
                            {displayNames[sourceName] || sourceName}
                          </Link>
                        );
                      })
                    ) : (
                      <span className="text-xs text-zinc-500">
                        No servers available
                      </span>
                    )}
                  </div>
                </div>

                {/* Current info line */}
                <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800/50 pt-3 text-xs text-zinc-500">
                  <span>
                    Current:{" "}
                    <span className="text-zinc-300">
                      {requestedSource || "not selected"}
                    </span>
                  </span>
                  {activeTranslation ? (
                    <span>
                      Language:{" "}
                      <span className="text-zinc-300">
                        {activeTranslation}
                      </span>
                    </span>
                  ) : null}
                  {nextEpisodeHref ? (
                    <Link
                      href={nextEpisodeHref}
                      className="rounded-md border border-zinc-700/60 px-2 py-1 text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                    >
                      Next Episode →
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {/* ── Next Airing Banner ──────────────────────── */}
          {anime?.nextAiringEpisode?.airingAt ? (
            <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm text-white shadow-lg shadow-cyan-900/20">
              <span className="text-base">🎉</span>
              <p className="flex-1">
                Estimated the next episode will come at{" "}
                <span className="font-semibold">
                  {formatAiringDate(anime.nextAiringEpisode.airingAt)}
                </span>
              </p>
            </div>
          ) : null}
        </div>

        {/* ╔═══════════════════════════════════════════════
           ║  RIGHT — Anime Info Sidebar
           ╚═══════════════════════════════════════════════ */}
        <aside className="space-y-3 xl:sticky xl:top-20 xl:h-[calc(100vh-100px)] overflow-y-auto custom-scrollbar no-scrollbar flex flex-col">
          <div className="space-y-3 rounded-xl border border-zinc-800/60 bg-[#141422]/90 p-3 backdrop-blur-sm shrink-0">
            {/* Cover image */}
            {displayCover ? (
              <div className="overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayCover}
                  alt={displayTitle}
                  className="h-40 w-full object-cover"
                />
              </div>
            ) : null}

            {/* Title */}
            <h1 className="text-xl font-bold leading-tight tracking-tight text-white">
              {displayTitle}
            </h1>

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-1.5">
              {anime?.averageScore ? (
                <span className="rounded bg-rose-600/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  HD
                </span>
              ) : null}
              {anime?.averageScore ? (
                <span className="rounded bg-orange-600/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  ⭐ {anime.averageScore}
                </span>
              ) : null}
              {anime?.popularity ? (
                <span className="rounded bg-emerald-700/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  ♡ {anime.popularity.toLocaleString()}
                </span>
              ) : null}
              {anime?.format ? (
                <span className="text-[11px] text-zinc-400">
                  · {anime.format}
                </span>
              ) : null}
              {anime?.episodes ? (
                <span className="text-[11px] text-zinc-400">
                  · {anime.episodes} eps
                </span>
              ) : null}
              {anime?.status ? (
                <span className="text-[11px] text-zinc-400">
                  · {anime.status}
                </span>
              ) : null}
            </div>

            {/* Synopsis */}
            <p className="text-[12px] leading-[1.6] text-zinc-400">
              {stripHtml(anime?.description || "No synopsis available.")}
            </p>

            {/* MeMo signature line */}
            <p className="text-[11px] leading-[1.5] text-zinc-500">
              MeMo is the best app to watch{" "}
              <span className="font-semibold text-zinc-300">
                {displayTitle}
              </span>{" "}
              SUB online, or you can even watch{" "}
              <span className="font-semibold text-zinc-300">
                {displayTitle}
              </span>{" "}
              DUB in HD quality.
            </p>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-1">
              <Link
                href={`/anime/${encodedAnimeId}?provider=${encodeURIComponent(provider)}${requestedSource ? `&source=${encodeURIComponent(requestedSource)}` : ""}${activeTranslation ? `&translation=${encodeURIComponent(activeTranslation)}` : ""}`}
                className="rounded-lg border border-zinc-700/60 px-3 py-1.5 text-[12px] font-medium text-zinc-200 transition hover:border-zinc-500 hover:text-white"
              >
                View detail
              </Link>
              <FavoriteButton
                animeId={animeId}
                provider={provider}
                animeTitle={anime?.title || queryAnimeTitle}
                animeCover={anime?.coverImage || queryAnimeCover}
                initialFavorited={Boolean(detailRes?.favorited)}
              />
            </div>
          </div>

          {/* Share section */}
          <div className="flex items-center gap-3 rounded-xl border border-zinc-800/60 bg-[#141422]/90 p-3 backdrop-blur-sm shrink-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-bold text-white">
              M
            </div>
            <div>
              <p className="text-[12px] font-semibold text-cyan-300">
                Share Anime
              </p>
              <p className="text-[11px] text-zinc-400">to your friends</p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
