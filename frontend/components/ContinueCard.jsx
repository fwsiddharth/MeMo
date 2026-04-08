import Link from "next/link";

export default function ContinueCard({ item, className = "" }) {
  const progress = item?.duration > 0 ? Math.min(100, Math.max(0, (item.position / item.duration) * 100)) : 0;
  const encodedAnimeId = encodeURIComponent(String(item?.animeId || ""));

  return (
    <Link
      href={{
        pathname: `/player/${encodedAnimeId}/${encodeURIComponent(item.episodeId)}`,
        query: {
          provider: item.provider || "anilist",
          source: item.source || "",
          title: item.episodeTitle || "",
          ep: item.episodeNumber || "",
          animeTitle: item.animeTitle || "",
          cover: item.animeCover || "",
        },
      }}
      className={`glass flex items-center gap-3 rounded-xl p-3 transition hover:border-zinc-500 ${className}`.trim()}
    >
      {item.animeCover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.animeCover}
          alt={item.animeTitle || "cover"}
          className="h-20 w-12 rounded-md object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-20 w-12 rounded-md bg-zinc-800" />
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-medium">{item.animeTitle || "Unknown anime"}</p>
        <p className="line-clamp-1 text-xs text-zinc-400">
          {item.episodeTitle || `Episode ${item.episodeNumber || "?"}`}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-cyan-300" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </Link>
  );
}
