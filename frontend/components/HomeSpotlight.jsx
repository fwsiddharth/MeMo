"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { stripHtml } from "../lib/api";

function animeHref(anime) {
  const encodedAnimeId = encodeURIComponent(String(anime?.id || ""));
  return anime?.provider && anime.provider !== "anilist"
    ? {
        pathname: `/anime/${encodedAnimeId}`,
        query: { provider: anime.provider },
      }
    : `/anime/${encodedAnimeId}`;
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
    <section className="glass relative min-h-[470px] overflow-hidden rounded-[6px] md:min-h-[560px]">
      <div className="absolute inset-0">
        {active.bannerImage || active.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={active.id}
            src={active.bannerImage || active.coverImage}
            alt={active.title}
            className="h-full w-full object-cover opacity-25"
          />
        ) : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,112,243,0.14),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(0,0,0,0.035),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.98)_18%,rgba(250,250,250,0.98)_55%,rgba(255,255,255,0.92)_100%)]" />
      </div>

      <div className="relative flex h-full min-h-[470px] flex-col justify-between p-6 md:min-h-[560px] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-zinc-900 shadow-sm">
            Spotlight
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={goPrev}
              className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-zinc-200 bg-white text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
              aria-label="Previous spotlight anime"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-zinc-200 bg-white text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
              aria-label="Next spotlight anime"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="max-w-3xl space-y-5">
          <div className="space-y-4">
            <h1 className="app-mono max-w-3xl text-4xl font-medium tracking-[-0.04em] text-zinc-950 md:text-6xl">
              {active.title}
            </h1>
            <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-600">
              {active.format ? <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 shadow-sm">{active.format}</span> : null}
              {active.status ? <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 shadow-sm">{active.status}</span> : null}
              {active.episodes ? <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 shadow-sm">{active.episodes} eps</span> : null}
            </div>
            <p className="line-clamp-4 max-w-2xl text-sm leading-6 text-zinc-600 md:text-base">
              {stripHtml(active.description || "") || "No synopsis available."}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={animeHref(active)}
              className="rounded-[6px] border border-zinc-900 bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              Watch now
            </Link>
            <Link
              href="/search"
              className="rounded-[6px] border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-900 transition hover:border-zinc-300 hover:bg-zinc-50"
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
                  index === activeIndex ? "h-2.5 w-8 bg-zinc-900" : "h-2.5 w-2.5 bg-zinc-300 hover:bg-zinc-500"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={goPrev}
              className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-zinc-200 bg-white text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
              aria-label="Previous spotlight anime"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-zinc-200 bg-white text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
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
