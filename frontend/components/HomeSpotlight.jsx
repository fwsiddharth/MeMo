"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { stripHtml } from "../lib/api";

function animeHref(anime) {
  return anime?.provider && anime.provider !== "anilist"
    ? {
        pathname: `/anime/${anime.id}`,
        query: { provider: anime.provider },
      }
    : `/anime/${anime?.id}`;
}

export default function HomeSpotlight({ items = [] }) {
  const pool = useMemo(() => items.filter(Boolean).slice(0, 6), [items]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (pool.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % pool.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [pool.length]);

  useEffect(() => {
    setActiveIndex(0);
  }, [pool.length]);

  const active = pool[activeIndex] || null;
  if (!active) return null;

  const goPrev = () => {
    setActiveIndex((current) => (current - 1 + pool.length) % pool.length);
  };

  const goNext = () => {
    setActiveIndex((current) => (current + 1) % pool.length);
  };

  return (
    <section className="glass relative min-h-[470px] overflow-hidden rounded-[2rem] md:min-h-[560px]">
      <div className="absolute inset-0">
        {active.bannerImage || active.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={active.id}
            src={active.bannerImage || active.coverImage}
            alt={active.title}
            className="h-full w-full object-cover opacity-55"
          />
        ) : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_24%),linear-gradient(110deg,rgba(5,7,12,0.98)_18%,rgba(7,10,16,0.88)_55%,rgba(9,12,18,0.54)_100%)]" />
      </div>

      <div className="relative flex h-full min-h-[470px] flex-col justify-between p-6 md:min-h-[560px] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-cyan-300">
            Spotlight
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={goPrev}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/25 text-zinc-100 transition hover:border-white/25 hover:bg-black/40"
              aria-label="Previous spotlight anime"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/25 text-zinc-100 transition hover:border-white/25 hover:bg-black/40"
              aria-label="Next spotlight anime"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="max-w-3xl space-y-5">
          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
              {active.title}
            </h1>
            <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-300">
              {active.format ? <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">{active.format}</span> : null}
              {active.status ? <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">{active.status}</span> : null}
              {active.episodes ? <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">{active.episodes} eps</span> : null}
            </div>
            <p className="line-clamp-4 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">
              {stripHtml(active.description || "") || "No synopsis available."}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={animeHref(active)}
              className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-200"
            >
              Watch now
            </Link>
            <Link
              href="/search"
              className="rounded-2xl border border-white/12 bg-black/20 px-5 py-3 text-sm font-medium text-zinc-100 transition hover:border-white/25"
            >
              Browse anime
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {pool.map((anime, index) => (
              <button
                key={`${anime.provider || "anilist"}-${anime.id}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Go to spotlight anime ${index + 1}`}
                className={`rounded-full transition ${
                  index === activeIndex ? "h-2.5 w-8 bg-cyan-300" : "h-2.5 w-2.5 bg-white/30 hover:bg-white/55"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={goPrev}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/25 text-zinc-100 transition hover:border-white/25 hover:bg-black/40"
              aria-label="Previous spotlight anime"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/25 text-zinc-100 transition hover:border-white/25 hover:bg-black/40"
              aria-label="Next spotlight anime"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
