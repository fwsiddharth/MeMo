"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

function formatStableDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function EpisodeBrowser({
  animeId,
  provider = "anilist",
  animeTitle,
  animeCover,
  source,
  translation = "",
  episodes = [],
  historyItems = [],
}) {
  const encodedAnimeId = encodeURIComponent(String(animeId || ""));
  const [query, setQuery] = useState("");
  const [descending, setDescending] = useState(false);

  const canonical = useMemo(
    () => [...episodes].sort((a, b) => Number(a.number || 0) - Number(b.number || 0)),
    [episodes],
  );

  const nextEpisodeById = useMemo(() => {
    const map = new Map();
    canonical.forEach((ep, idx) => {
      map.set(ep.id, canonical[idx + 1] || null);
    });
    return map;
  }, [canonical]);

  const historyByEpisode = useMemo(() => {
    const map = new Map();
    for (const item of historyItems) {
      if (!item?.episodeId) continue;
      const existing = map.get(item.episodeId);
      if (!existing || Number(item.updatedAt || 0) > Number(existing.updatedAt || 0)) {
        map.set(item.episodeId, item);
      }
    }
    return map;
  }, [historyItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = canonical;
    if (q) {
      base = canonical.filter((ep) => {
        const num = String(ep.number || "");
        const title = String(ep.title || "").toLowerCase();
        return title.includes(q) || num.includes(q);
      });
    }
    base = [...base];
    if (descending) base.reverse();
    return base;
  }, [canonical, descending, query]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Episodes</h2>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find episode..."
            className="w-40 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs outline-none focus:border-zinc-500 md:w-56"
          />
          <button
            type="button"
            onClick={() => setDescending((v) => !v)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-500"
          >
            Sort: {descending ? "Newest First" : "Oldest First"}
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((ep, idx) => {
          const next = nextEpisodeById.get(ep.id) || filtered[idx + 1];
          const history = historyByEpisode.get(ep.id);
          const progress =
            history?.duration > 0
              ? Math.min(100, Math.max(0, (Number(history.position || 0) / Number(history.duration || 1)) * 100))
              : 0;
          const isCompleted = Boolean(history?.completed);
          const isInProgress = !isCompleted && progress > 0;

          return (
            <Link
              key={ep.id}
              href={{
                pathname: `/player/${encodedAnimeId}/${encodeURIComponent(ep.id)}`,
                query: {
                  source,
                  provider,
                  translation,
                  ep: ep.number || "",
                  title: ep.title || "",
                  animeTitle: animeTitle || "",
                  cover: animeCover || "",
                  nextEpisodeId: next?.id || "",
                  nextEpisodeNumber: next?.number || "",
                  nextEpisodeTitle: next?.title || "",
                },
              }}
              className="glass space-y-2 rounded-xl p-3 transition hover:border-zinc-500"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Episode {ep.number || "?"}</p>
                  <p className="line-clamp-1 text-xs text-zinc-400">{ep.title || "Untitled episode"}</p>
                </div>
                {isCompleted ? (
                  <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300">
                    Watched
                  </span>
                ) : isInProgress ? (
                  <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-200">
                    Resume
                  </span>
                ) : null}
              </div>

              {history ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{isCompleted ? "Completed" : isInProgress ? `${Math.round(progress)}% watched` : "Not started"}</span>
                    {history.updatedAt ? (
                      <span>{formatStableDate(history.updatedAt)}</span>
                    ) : null}
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${isCompleted ? "bg-emerald-300" : "bg-cyan-300"}`}
                      style={{ width: `${isCompleted ? 100 : progress}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
