import Link from "next/link";
import { apiFetch } from "../lib/api";
import ContinueCard from "../components/ContinueCard";
import AnimatedSection from "../components/AnimatedSection";
import HomeSpotlight from "../components/HomeSpotlight";
import { requireServerSession } from "../lib/supabase/server";

export const dynamic = "force-dynamic";

function animeHref(anime) {
  const encodedAnimeId = encodeURIComponent(String(anime?.id || ""));
  return anime?.provider && anime.provider !== "anilist"
    ? {
        pathname: `/anime/${encodedAnimeId}`,
        query: { provider: anime.provider },
      }
    : `/anime/${encodedAnimeId}`;
}

function metaText(anime) {
  return [anime?.format, anime?.episodes ? `${anime.episodes} eps` : "", anime?.status]
    .filter(Boolean)
    .join(" • ");
}

function ListPanel({ title, items = [], limit = 8, fillHeight = false }) {
  return (
    <section className={`glass rounded-[6px] p-4 md:p-5 ${fillHeight ? "h-full min-h-[470px] md:min-h-[560px]" : ""}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium tracking-[-0.02em] text-zinc-900">{title}</h2>
        <Link href="/search" className="text-xs text-zinc-500 hover:text-zinc-900">
          More
        </Link>
      </div>
      {items.length ? (
        <div className="space-y-2.5">
          {items.slice(0, limit).map((anime, index) => (
            <Link
              key={`${title}-${anime.provider || "anilist"}-${anime.id}`}
              href={animeHref(anime)}
              className="group flex items-center gap-3 rounded-[6px] border border-transparent bg-white p-2.5 transition hover:border-zinc-200 hover:bg-zinc-50"
            >
              <div className="app-mono w-7 shrink-0 text-right text-sm font-medium text-zinc-400 transition group-hover:text-zinc-900">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-[4px] bg-zinc-100">
                {anime.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={anime.coverImage} alt={anime.title} className="h-full w-full object-cover" loading="lazy" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-medium text-zinc-900">{anime.title}</p>
                <p className="line-clamp-1 text-xs text-zinc-500">{metaText(anime) || "Unknown format"}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-[6px] border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
          No titles available right now.
        </div>
      )}
    </section>
  );
}

function PosterRow({ title, items = [], limit = 6 }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-medium tracking-[-0.03em] text-zinc-900">{title}</h2>
        <Link href="/search" className="text-xs text-zinc-500 hover:text-zinc-900">
          More
        </Link>
      </div>
      {items.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {items.slice(0, limit).map((anime) => (
            <Link
              key={`${title}-${anime.provider || "anilist"}-${anime.id}`}
              href={animeHref(anime)}
              className="group glass overflow-hidden rounded-[6px] transition hover:border-zinc-300"
            >
              <div className="aspect-[3/4] overflow-hidden bg-zinc-100">
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
                <p className="line-clamp-2 text-sm font-medium text-zinc-900">{anime.title}</p>
                <p className="text-xs text-zinc-500">{metaText(anime) || "Unknown format"}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-[6px] border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
          No titles available right now.
        </div>
      )}
    </section>
  );
}

export default async function HomePage() {
  const session = await requireServerSession();
  const authHeaders = {
    Authorization: `Bearer ${session.access_token}`,
  };

  let home = {
    trending: [],
    popular: [],
    recent: [],
    topRated: [],
    airing: [],
    upcoming: [],
    latestEpisodes: [],
    latestCompleted: [],
  };
  let spotlight = { spotlight: [], popularSeason: [] };
  let continueWatching = [];
  let error = "";

  const [homeResult, spotlightResult, continueResult] = await Promise.allSettled([
    apiFetch("/api/home", { headers: authHeaders }),
    apiFetch("/api/home/spotlight", { headers: authHeaders }),
    apiFetch("/api/history/continue", { headers: authHeaders }),
  ]);

  if (homeResult.status === "fulfilled") {
    home = homeResult.value;
  } else if (!error) {
    error = homeResult.reason?.message || "Failed to load data.";
  }

  if (spotlightResult.status === "fulfilled") {
    spotlight = spotlightResult.value;
  }

  if (continueResult.status === "fulfilled") {
    continueWatching = continueResult.value.items || [];
  }

  const spotlightItems = spotlight.spotlight?.length
    ? spotlight.spotlight
    : [...(home.trending || []), ...(home.popular || [])].filter(
        (anime, index, array) => anime?.id && array.findIndex((entry) => entry?.id === anime.id) === index,
      ).slice(0, 6);

  const popularSeason = spotlight.popularSeason?.length ? spotlight.popularSeason : home.popular || [];
  const topAiring = home.airing || [];
  const topRated = home.topRated || [];
  const upcoming = home.upcoming || [];
  const allTimePopular = home.popular || [];
  const latestEpisodes = home.latestEpisodes?.length ? home.latestEpisodes : home.recent || [];
  const latestCompleted = home.latestCompleted || [];

  return (
    <div className="space-y-10 pb-8">
      {error ? (
        <div className="rounded-[6px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {spotlightItems.length ? (
        <AnimatedSection>
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.72fr)_380px]">
            <HomeSpotlight items={spotlightItems} />
            <ListPanel title="Most popular this season" items={popularSeason} limit={8} fillHeight />
          </section>
        </AnimatedSection>
      ) : null}

      {continueWatching.length ? (
        <AnimatedSection delay={1}>
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-medium tracking-[-0.03em] text-zinc-900">Continue watching</h2>
              <Link href="/library" className="text-xs text-zinc-500 hover:text-zinc-900">
                Library
              </Link>
            </div>
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-3">
                {continueWatching.map((item) => (
                  <ContinueCard
                    key={`${item.provider || "anilist"}-${item.animeId}-${item.episodeId}-${item.source}`}
                    item={item}
                    className="min-w-[300px] md:min-w-[340px]"
                  />
                ))}
              </div>
            </div>
          </section>
        </AnimatedSection>
      ) : null}

      <AnimatedSection delay={2}>
        <div className="grid gap-4 xl:grid-cols-3">
          <ListPanel title="Top airing" items={topAiring} limit={6} />
          <ListPanel title="Top rated" items={topRated} limit={6} />
          <ListPanel title="Upcoming next" items={upcoming} limit={6} />
        </div>
      </AnimatedSection>

      <AnimatedSection delay={3}>
        <PosterRow title="All time popular" items={allTimePopular} />
      </AnimatedSection>

      <AnimatedSection delay={4}>
        <PosterRow title="Latest ep releases" items={latestEpisodes} />
      </AnimatedSection>

      <AnimatedSection delay={5}>
        <PosterRow title="Latest completed" items={latestCompleted} />
      </AnimatedSection>
    </div>
  );
}
