import Link from "next/link";
import { stripHtml } from "../lib/api";

export default function AnimeCard({ anime }) {
  const href = anime.provider && anime.provider !== "anilist"
    ? {
        pathname: `/anime/${anime.id}`,
        query: { provider: anime.provider },
      }
    : `/anime/${anime.id}`;

  return (
    <Link
      href={href}
      className="glass group overflow-hidden rounded-2xl transition hover:border-zinc-500"
    >
      <div className="aspect-[3/4] w-full overflow-hidden bg-zinc-800">
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
          <p className="line-clamp-1 text-sm font-medium">{anime.title}</p>
          {anime.averageScore ? (
            <span className="rounded-full border border-emerald-300/50 bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-300">
              {anime.averageScore}
            </span>
          ) : null}
        </div>
        <p className="line-clamp-2 text-xs text-zinc-400">{stripHtml(anime.description || "")}</p>
        <p className="text-xs text-zinc-500">
          {anime.episodes ? `${anime.episodes} eps` : "Unknown episodes"}
        </p>
      </div>
    </Link>
  );
}
