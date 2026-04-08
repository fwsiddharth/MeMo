import Link from "next/link";
import { apiFetch } from "../../lib/api";
import ContinueCard from "../../components/ContinueCard";
import { requireServerSession } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const session = await requireServerSession();
  const authHeaders = {
    Authorization: `Bearer ${session.access_token}`,
  };

  let favorites = [];
  let continueWatching = [];
  let recentHistory = [];
  let error = "";

  try {
    const [favRes, contRes, histRes] = await Promise.all([
      apiFetch("/api/favorites?limit=80", { headers: authHeaders }),
      apiFetch("/api/history/continue?limit=30", { headers: authHeaders }),
      apiFetch("/api/history/recent?limit=40", { headers: authHeaders }),
    ]);
    favorites = favRes.items || [];
    continueWatching = contRes.items || [];
    recentHistory = histRes.items || [];
  } catch (err) {
    error = err.message || "Failed to load library.";
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Your Space</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Library</h1>
      </header>

      {error ? (
        <p className="rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Continue Watching</h2>
        {continueWatching.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {continueWatching.map((item) => (
              <ContinueCard key={`${item.provider || "anilist"}-${item.animeId}-${item.episodeId}-${item.source}`} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No watch progress yet.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Favorites</h2>
        {favorites.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {favorites.map((item) => (
              <Link
                key={`${item.provider || "anilist"}-${item.animeId}`}
                href={
                  item.provider && item.provider !== "anilist"
                    ? {
                        pathname: `/anime/${encodeURIComponent(item.animeId)}`,
                        query: { provider: item.provider, source: item.source || item.provider },
                      }
                    : `/anime/${encodeURIComponent(item.animeId)}`
                }
                className="glass overflow-hidden rounded-2xl transition hover:border-zinc-500"
              >
                <div className="aspect-[3/4] w-full bg-zinc-800">
                  {item.animeCover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.animeCover} alt={item.animeTitle || "cover"} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="p-3">
                  <p className="line-clamp-1 text-sm font-medium">{item.animeTitle || "Untitled"}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No favorites yet.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent Activity</h2>
        <div className="space-y-2">
          {recentHistory.slice(0, 18).map((item) => (
            <Link
              key={`${item.provider || "anilist"}-${item.animeId}-${item.episodeId}-${item.updatedAt}`}
              href={{
                pathname: `/player/${encodeURIComponent(item.animeId)}/${encodeURIComponent(item.episodeId)}`,
                query: {
                  provider: item.provider || "anilist",
                  source: item.source || "",
                  ep: item.episodeNumber || "",
                  title: item.episodeTitle || "",
                  animeTitle: item.animeTitle || "",
                  cover: item.animeCover || "",
                },
              }}
              className="glass flex items-center justify-between gap-3 rounded-xl p-3 text-sm hover:border-zinc-500"
            >
              <div className="min-w-0">
                <p className="line-clamp-1 font-medium">{item.animeTitle || "Unknown anime"}</p>
                <p className="line-clamp-1 text-xs text-zinc-400">
                  {item.episodeTitle || `Episode ${item.episodeNumber || "?"}`}
                </p>
              </div>
              <p className="text-xs text-zinc-500">
                {item.completed ? "Watched" : `${Math.floor(item.position || 0)}s`}
              </p>
            </Link>
          ))}
          {!recentHistory.length ? <p className="text-sm text-zinc-500">No history yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
