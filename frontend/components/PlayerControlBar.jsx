"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { SkipBack, SkipForward } from "lucide-react";
import { useClientSettings } from "./ClientSettingsProvider";

export default function PlayerControlBar({
  prevEpisodeHref = "",
  nextEpisodeHref = "",
}) {
  const { settings, setSettings } = useClientSettings();
  const [autoPlay, setAutoPlay] = useState(true);
  const [skipIntro, setSkipIntro] = useState(true);
  const autoNext = settings.autoplayNext ?? true;

  // Sync autoPlay from local storage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("memo_auto_play");
    if (stored !== null) setAutoPlay(stored === "1");
    const storedSkip = window.localStorage.getItem("memo_skip_intro");
    if (storedSkip !== null) setSkipIntro(storedSkip === "1");
  }, []);

  const toggleAutoPlay = () => {
    const next = !autoPlay;
    setAutoPlay(next);
    window.localStorage.setItem("memo_auto_play", next ? "1" : "0");
  };

  const toggleSkipIntro = () => {
    const next = !skipIntro;
    setSkipIntro(next);
    window.localStorage.setItem("memo_skip_intro", next ? "1" : "0");
  };

  const toggleAutoNext = () => {
    const next = !autoNext;
    setSettings((current) => ({ ...current, autoplayNext: next }));
  };

  return (
    <div className="flex items-center justify-between rounded-[6px] border border-zinc-200 bg-white px-3 py-2 shadow-[0_0_0_1px_#ebebeb,0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-3 text-[12px] md:gap-5">
        <button
          type="button"
          onClick={toggleAutoPlay}
          className="flex items-center gap-1.5 transition hover:opacity-80"
        >
          <span className="text-zinc-500">Auto Play</span>
          <span
            className={`font-medium ${autoPlay ? "text-zinc-900" : "text-zinc-400"}`}
          >
            {autoPlay ? "On" : "Off"}
          </span>
        </button>

        <button
          type="button"
          onClick={toggleSkipIntro}
          className="flex items-center gap-1.5 transition hover:opacity-80"
        >
          <span className="text-zinc-500">Auto Skip Intro</span>
          <span
            className={`font-medium ${skipIntro ? "text-zinc-900" : "text-zinc-400"}`}
          >
            {skipIntro ? "On" : "Off"}
          </span>
        </button>

        <button
          type="button"
          onClick={toggleAutoNext}
          className="flex items-center gap-1.5 transition hover:opacity-80"
        >
          <span className="text-zinc-500">Auto Next</span>
          <span
            className={`font-medium ${autoNext ? "text-zinc-900" : "text-zinc-400"}`}
          >
            {autoNext ? "On" : "Off"}
          </span>
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {prevEpisodeHref ? (
          <Link
            href={prevEpisodeHref}
            className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-zinc-200 bg-white text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
            title="Previous episode"
          >
            <SkipBack size={15} />
          </Link>
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-zinc-200 bg-zinc-50 text-zinc-300">
            <SkipBack size={15} />
          </span>
        )}
        {nextEpisodeHref ? (
          <Link
            href={nextEpisodeHref}
            className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-zinc-200 bg-white text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
            title="Next episode"
          >
            <SkipForward size={15} />
          </Link>
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-zinc-200 bg-zinc-50 text-zinc-300">
            <SkipForward size={15} />
          </span>
        )}
      </div>
    </div>
  );
}
