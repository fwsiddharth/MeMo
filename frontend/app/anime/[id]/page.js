import { redirect } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { requireServerSession } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

function inferTranslationFromEpisodeId(episodeId) {
  const raw = String(episodeId || "");
  if (raw.startsWith("animesalt|")) return raw.split("|")[3] || "";
  if (raw.startsWith("allmanga-web|")) return raw.split("|")[2] || "";
  if (raw.startsWith("gojowtf|")) return raw.split("|")[3] || "";
  const parts = raw.split("|");
  if (parts.length === 3 && ["sub", "dub", "raw"].includes(parts[1])) return parts[1];
  return "";
}

export default async function AnimeDetailPage({ params, searchParams }) {
  const session = await requireServerSession();
  const authHeaders = {
    Authorization: `Bearer ${session.access_token}`,
  };

  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const animeId = decodeURIComponent(resolvedParams.id);
  const encodedAnimeId = encodeURIComponent(animeId);
  const provider = String(resolvedSearchParams?.provider || "anilist");
  const requestedSource = String(resolvedSearchParams?.source || "").trim();
  const requestedTranslation = String(resolvedSearchParams?.translation || "").trim();

  if (!requestedSource) {
    const query = new URLSearchParams();
    query.set("provider", provider);
    query.set("manualSource", "1");
    if (requestedTranslation) query.set("translation", requestedTranslation);
    
    console.log(`[PERF - Anime Bridge] (${animeId}) Missing source, triggering redirect...`);
    redirect(`/player/${encodedAnimeId}/_?${query.toString()}`);
  }

  try {
    const detailQuery = new URLSearchParams();
    detailQuery.set("provider", provider);
    detailQuery.set("source", requestedSource);
    if (requestedTranslation) detailQuery.set("translation", requestedTranslation);

    const payload = await apiFetch(`/api/anime/${encodedAnimeId}?${detailQuery.toString()}`, {
      headers: authHeaders,
    });

    const anime = payload?.anime || {};
    const episodes = [...(payload?.episodes || [])].sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
    if (!episodes.length) {
      const query = new URLSearchParams();
      query.set("provider", provider);
      query.set("manualSource", "1");
      if (requestedTranslation) query.set("translation", requestedTranslation);
      query.set("animeTitle", String(anime.title || ""));
      query.set("cover", String(anime.coverImage || ""));
      redirect(`/player/${encodedAnimeId}/_?${query.toString()}`);
    }

    const firstEpisode = episodes[0];
    const secondEpisode = episodes[1] || null;
    const finalTranslation = requestedTranslation || payload?.activeTranslation || inferTranslationFromEpisodeId(firstEpisode.id);

    const query = new URLSearchParams();
    query.set("provider", provider);
    query.set("source", requestedSource);
    query.set("manualSource", "1");
    if (finalTranslation) query.set("translation", finalTranslation);
    query.set("ep", String(firstEpisode.number || ""));
    query.set("title", String(firstEpisode.title || ""));
    query.set("animeTitle", String(anime.title || ""));
    query.set("cover", String(anime.coverImage || ""));

    if (secondEpisode?.id) {
      query.set("nextEpisodeId", String(secondEpisode.id));
      query.set("nextEpisodeNumber", String(secondEpisode.number || ""));
      query.set("nextEpisodeTitle", String(secondEpisode.title || ""));
    }

    redirect(`/player/${encodedAnimeId}/${encodeURIComponent(String(firstEpisode.id))}?${query.toString()}`);
  } catch (error) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Anime</h1>
        <p className="rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
          {error?.message || "Failed to open anime."}
        </p>
      </div>
    );
  }
}
