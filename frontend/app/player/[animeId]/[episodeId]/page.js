import Link from "next/link";
import VideoPlayer from "../../../../components/VideoPlayer";
import { apiFetch } from "../../../../lib/api";
import { requireServerSession } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

function inferTranslationFromEpisodeId(episodeId) {
  const raw = String(episodeId || "");
  if (raw.startsWith("animesalt|")) return raw.split("|")[3] || "";
  if (raw.startsWith("allmanga-web|")) return raw.split("|")[2] || "";
  if (raw.startsWith("gojowtf|")) return raw.split("|")[3] || "";
  const parts = raw.split("|");
  if (parts.length === 3 && ["sub", "dub", "raw"].includes(parts[1])) {
    return parts[1];
  }
  return "";
}

function formatOptionValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (["sub", "dub", "raw"].includes(raw.toLowerCase())) return raw.toUpperCase();
  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function PlayerPage({ params, searchParams }) {
  const session = await requireServerSession();
  const authHeaders = {
    Authorization: `Bearer ${session.access_token}`,
  };

  const animeId = params.animeId;
  const episodeId = decodeURIComponent(params.episodeId);
  const provider = String(searchParams?.provider || "anilist");
  const source = String(searchParams?.source || "");
  const translation = String(searchParams?.translation || inferTranslationFromEpisodeId(episodeId));
  const episodeNumber = Number(searchParams?.ep || 0);
  const episodeTitle = String(searchParams?.title || "");
  const animeTitle = String(searchParams?.animeTitle || "");
  const animeCover = String(searchParams?.cover || "");
  const nextEpisodeId = String(searchParams?.nextEpisodeId || "");
  const nextEpisodeNumber = Number(searchParams?.nextEpisodeNumber || 0);
  const nextEpisodeTitle = String(searchParams?.nextEpisodeTitle || "");

  let streamRes = null;
  let resumeRes = null;
  let settingsRes = null;
  let error = "";

  try {
    [streamRes, resumeRes, settingsRes] = await Promise.all([
      apiFetch(
        `/api/stream?animeId=${encodeURIComponent(animeId)}&provider=${encodeURIComponent(provider)}&episodeId=${encodeURIComponent(episodeId)}&source=${encodeURIComponent(source)}`,
        { headers: authHeaders },
      ),
      apiFetch(
        `/api/history/resume?animeId=${encodeURIComponent(animeId)}&provider=${encodeURIComponent(provider)}&episodeId=${encodeURIComponent(episodeId)}&source=${encodeURIComponent(source || "default")}`,
        { headers: authHeaders },
      ),
      apiFetch("/api/settings", { headers: authHeaders }),
    ]);
  } catch (err) {
    error = err.message || "Failed to load player.";
  }

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Player</h1>
        <p className="rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>
        <Link
          href={`/anime/${animeId}?provider=${encodeURIComponent(provider)}`}
          className="text-sm text-zinc-300 underline"
        >
          Back to anime
        </Link>
      </div>
    );
  }

  const stream = streamRes?.stream;
  const resumeAt = Number(resumeRes?.item?.position || 0);
  const playerDefaults = settingsRes?.settings || {};
  const nextEpisodeHref = nextEpisodeId
    ? `/player/${animeId}/${encodeURIComponent(nextEpisodeId)}?provider=${encodeURIComponent(provider)}&source=${encodeURIComponent(source)}&translation=${encodeURIComponent(translation)}&ep=${encodeURIComponent(nextEpisodeNumber || "")}&title=${encodeURIComponent(nextEpisodeTitle || "")}&animeTitle=${encodeURIComponent(animeTitle || "")}&cover=${encodeURIComponent(animeCover || "")}`
    : "";

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{animeTitle || "Player"}</h1>
        <p className="text-sm text-zinc-400">
          Episode {episodeNumber || "?"}
          {episodeTitle ? ` · ${episodeTitle}` : ""}
        </p>
      </header>

      <VideoPlayer
        stream={stream}
        animeId={animeId}
        provider={provider}
        episodeId={episodeId}
        source={source || "default"}
        animeTitle={animeTitle}
        animeCover={animeCover}
        episodeNumber={episodeNumber}
        episodeTitle={episodeTitle}
        resumeAt={resumeAt}
        nextEpisodeHref={nextEpisodeHref}
        preferredSubLang={String(playerDefaults.preferredSubLang || "en")}
        autoplayNextDefault={Boolean(playerDefaults.autoplayNext)}
      />

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>Source: {streamRes?.source || source || "default"}</span>
        <span>
          {translation ? `${formatOptionValue(translation)} · ` : ""}
          Resume at: {Math.floor(resumeAt)}s
        </span>
      </div>

      {nextEpisodeHref ? (
        <Link
          href={nextEpisodeHref}
          className="inline-flex rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-500"
        >
          Next Episode {nextEpisodeNumber ? `(${nextEpisodeNumber})` : ""}
        </Link>
      ) : null}

      <Link
        href={`/anime/${animeId}?provider=${encodeURIComponent(provider)}&source=${encodeURIComponent(source)}&translation=${encodeURIComponent(translation)}`}
        className="text-sm text-zinc-300 underline"
      >
        Back to episodes
      </Link>
    </div>
  );
}
