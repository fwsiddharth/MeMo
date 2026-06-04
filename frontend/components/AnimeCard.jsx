import Link from "next/link";
import { stripHtml } from "../lib/api";

export default function AnimeCard({ anime }) {
  const encodedAnimeId = encodeURIComponent(String(anime?.id || ""));
  const href = anime.provider && anime.provider !== "anilist"
    ? {
        pathname: `/anime/${encodedAnimeId}`,
        query: {
          provider: anime.provider,
        },
      }
    : `/anime/${encodedAnimeId}`;

  const metaLine =
    stripHtml(anime.description || "") ||
    [anime.languages?.slice?.(0, 2)?.join(" • "), anime.platforms?.slice?.(0, 2)?.join(" • ")]
      .filter(Boolean)
      .join(" · ");

  return (
    <Link
      href={href}
      className="glass group overflow-hidden rounded-[6px] transition hover:border-zinc-300"
    >
      <div className="aspect-[3/4] w-full overflow-hidden bg-zinc-100">
        {anime.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={anime.coverImage}
            alt={anime.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : null}
      </div>
      <div className="space-y-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-1 text-sm font-medium text-zinc-900">{anime.title}</p>
          {anime.averageScore ? (
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] text-zinc-700">
              {anime.averageScore}
            </span>
          ) : null}
        </div>
        <p className="line-clamp-2 text-xs text-zinc-500">{metaLine || "No synopsis available."}</p>
        <p className="text-xs text-zinc-400">
          {anime.episodes ? `${anime.episodes} eps` : "Unknown episodes"}
        </p>
      </div>
    </Link>
  );
}
