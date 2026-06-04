"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { LayoutGrid, Search, ChevronDown } from "lucide-react";

const RANGE_SIZE = 100;

export default function EpisodeSidebar({
  episodes = [],
  currentEpisodeId = "",
  watchedIds = [],
  className = "",
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [rangeStart, setRangeStart] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const totalEpisodes = episodes.length;
  const watchedSet = useMemo(() => new Set(watchedIds), [watchedIds]);

  const ranges = useMemo(() => {
    if (totalEpisodes <= RANGE_SIZE) return [];
    const result = [];
    for (let i = 0; i < totalEpisodes; i += RANGE_SIZE) {
      const startEp = episodes[i]?.number || i + 1;
      const endIdx = Math.min(i + RANGE_SIZE, totalEpisodes) - 1;
      const endEp = episodes[endIdx]?.number || endIdx + 1;
      result.push({ start: i, label: `EPS: ${startEp}-${endEp}` });
    }
    return result;
  }, [episodes, totalEpisodes]);

  // Auto-select range containing currently-playing episode
  useEffect(() => {
    if (!currentEpisodeId) return;
    const idx = episodes.findIndex(
      (ep) => String(ep.id) === String(currentEpisodeId),
    );
    if (idx >= 0) {
      setRangeStart(Math.floor(idx / RANGE_SIZE) * RANGE_SIZE);
    }
  }, [currentEpisodeId, episodes]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const visibleEpisodes = useMemo(() => {
    const q = searchQuery.trim();
    if (q) {
      const num = Number(q);
      if (!Number.isNaN(num) && num > 0) {
        return episodes.filter((ep) => Number(ep.number) === num);
      }
      return episodes.filter((ep) => String(ep.number).includes(q));
    }
    return episodes.slice(rangeStart, rangeStart + RANGE_SIZE);
  }, [episodes, rangeStart, searchQuery]);

  const currentRangeLabel = useMemo(() => {
    if (!ranges.length) return `EPS: 1-${totalEpisodes}`;
    const range = ranges.find((r) => r.start === rangeStart);
    return range?.label || ranges[0]?.label || "";
  }, [ranges, rangeStart, totalEpisodes]);

  return (
    <aside
      className={`flex flex-col overflow-hidden rounded-[6px] border border-zinc-200 bg-white shadow-[0_0_0_1px_#ebebeb,0_1px_2px_rgba(0,0,0,0.05)] ${className}`}
    >
      {/* Header */}
      <div className="border-b border-zinc-200 px-3 pb-2.5 pt-3">
        <p className="mb-2.5 text-[13px] font-medium text-zinc-900">
          List of episodes:
        </p>

        <div className="flex items-center gap-1.5">
          {/* Range dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-1 rounded-[6px] border border-zinc-200 bg-white px-2 py-[5px] text-[11px] text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
            >
              <LayoutGrid size={11} />
              <span className="whitespace-nowrap">{currentRangeLabel}</span>
              <ChevronDown
                size={11}
                className={`transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
              />
            </button>
            {dropdownOpen && ranges.length > 0 ? (
              <div className="absolute left-0 top-full z-50 mt-1 w-36 rounded-[6px] border border-zinc-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                {ranges.map((range) => (
                  <button
                    key={range.start}
                    type="button"
                    onClick={() => {
                      setRangeStart(range.start);
                      setDropdownOpen(false);
                      setSearchQuery("");
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-[11px] transition hover:bg-zinc-50 ${
                      range.start === rangeStart
                        ? "bg-zinc-100 text-zinc-900"
                        : "text-zinc-600"
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Episode search */}
          <div className="flex flex-1 items-center gap-1 rounded-[6px] border border-zinc-200 bg-white px-2 py-[5px]">
            <Search size={11} className="shrink-0 text-zinc-400" />
            <input
              type="text"
              placeholder="Number of Ep"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-w-0 bg-transparent text-[11px] text-zinc-900 outline-none placeholder:text-zinc-400"
            />
          </div>
        </div>
      </div>

      {/* Episode grid */}
      <div className="flex-1 overflow-y-auto px-3 py-2.5">
        {visibleEpisodes.length ? (
          <div className="grid grid-cols-5 gap-[5px]">
            {visibleEpisodes.map((ep) => {
              const isActive =
                String(ep.id) === String(currentEpisodeId);
              const isWatched = watchedSet.has(String(ep.id));

              return (
                <Link
                  key={ep.id}
                  href={ep.href || "#"}
                  className={`flex h-[30px] items-center justify-center rounded text-[12px] font-medium transition-colors ${
                    isActive
                      ? "border border-zinc-900 bg-zinc-900 text-white"
                      : isWatched
                        ? "border border-zinc-200 bg-zinc-50 text-zinc-900 hover:bg-zinc-100"
                        : "border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  {ep.number || "?"}
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="py-4 text-center text-xs text-zinc-500">
            {searchQuery.trim()
              ? "No episodes match your search."
              : "No episodes available."}
          </p>
        )}
      </div>
    </aside>
  );
}
