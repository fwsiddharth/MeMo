import AnimeCard from "./AnimeCard";

export default function SectionGrid({ title, subtitle, items }) {
  if (!items?.length) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {subtitle ? <p className="text-xs text-zinc-500">{subtitle}</p> : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((anime) => (
          <AnimeCard key={`${title}-${anime.provider || "anilist"}-${anime.id}`} anime={anime} />
        ))}
      </div>
    </section>
  );
}
