"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import { useRouter } from "next/navigation";
import {
  Play,
  Pause,
  Rewind,
  FastForward,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  PictureInPicture2,
  Captions,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { useClientSettings } from "./ClientSettingsProvider";
import { Button } from "./ui/button";

function formatTime(value) {
  const n = Number(value || 0);
  const sec = Math.floor(n % 60);
  const min = Math.floor((n / 60) % 60);
  const hr = Math.floor(n / 3600);
  if (hr > 0) return `${hr}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export default function VideoPlayer({
  stream,
  animeId,
  provider = "anilist",
  episodeId,
  source,
  animeTitle,
  animeCover,
  episodeNumber,
  episodeTitle,
  resumeAt = 0,
  nextEpisodeHref = "",
  preferredSubLang = "en",
  autoplayNextDefault = true,
}) {
  const router = useRouter();
  const wrapperRef = useRef(null);
  const videoRef = useRef(null);
  const iframeRef = useRef(null);
  const hlsRef = useRef(null);
  const autoplayNextRef = useRef(true);
  const {
    settings,
    setSettings,
  } = useClientSettings();

  const [playing, setPlaying] = useState(false);
  const [autoplayNext, setAutoplayNext] = useState(
    Boolean(settings.autoplayNext ?? autoplayNextDefault),
  );
  const [speed, setSpeed] = useState(1);
  const [subtitleChoice, setSubtitleChoice] = useState("off");
  const [quality, setQuality] = useState("auto");
  const [qualityOptions, setQualityOptions] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [theater, setTheater] = useState(false);
  const isEmbed = String(stream?.type || "").toLowerCase() === "embed";

  const applySubtitleChoice = (video, choice) => {
    if (!video?.textTracks) return;
    const tracks = Array.from(video.textTracks);
    tracks.forEach((track) => {
      track.mode = "disabled";
    });
    if (choice === "off") return;
    const selected = tracks[Number(choice)];
    if (selected) selected.mode = "showing";
  };

  const pickInitialSubtitleChoice = () => {
    const tracks = stream?.subtitles || [];
    if (!tracks.length) return "off";

    const desired = String(settings.preferredSubLang || preferredSubLang || "").trim().toLowerCase();
    if (!desired) return "0";

    const exact = tracks.findIndex((sub) => String(sub?.lang || "").toLowerCase() === desired);
    if (exact >= 0) return String(exact);

    const startsWith = tracks.findIndex((sub) => String(sub?.lang || "").toLowerCase().startsWith(desired));
    if (startsWith >= 0) return String(startsWith);

    return "0";
  };

  useEffect(() => {
    setAutoplayNext(Boolean(settings.autoplayNext ?? autoplayNextDefault));
  }, [autoplayNextDefault, settings.autoplayNext]);

  useEffect(() => {
    autoplayNextRef.current = autoplayNext;
  }, [autoplayNext]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    applySubtitleChoice(video, subtitleChoice);
  }, [subtitleChoice]);

  useEffect(() => {
    if (isEmbed) return undefined;
    const video = videoRef.current;
    if (!video || !stream?.url) return;

    let hls = null;
    setQuality("auto");
    setQualityOptions([]);
    setCurrentTime(0);
    setDuration(0);

    // Cleanup old tracks/elements from previous stream.
    const existingTracks = Array.from(video.querySelectorAll("track"));
    for (const track of existingTracks) track.remove();

    if (stream.type === "hls" && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsRef.current = hls;
      hls.loadSource(stream.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const levels = (hls.levels || []).map((level, idx) => ({
          index: idx,
          label: level.height ? `${level.height}p` : `Level ${idx + 1}`,
        }));
        const unique = [];
        const seen = new Set();
        for (const item of levels) {
          if (seen.has(item.label)) continue;
          seen.add(item.label);
          unique.push(item);
        }
        setQualityOptions(unique);
      });
    } else {
      video.src = stream.url;
      hlsRef.current = null;
    }

    let subCount = 0;
    for (const sub of stream?.subtitles || []) {
      if (!sub?.url) continue;
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = sub.label || sub.lang || "Subtitle";
      track.srclang = sub.lang || "en";
      track.src = sub.url;
      track.default = subCount === 0;
      video.appendChild(track);
      subCount += 1;
    }

    const initialSubtitle = pickInitialSubtitleChoice();
    setSubtitleChoice(initialSubtitle);
    setTimeout(() => applySubtitleChoice(video, initialSubtitle), 0);

    const onLoadedMetadata = () => {
      setDuration(video.duration || 0);
      if (resumeAt > 0 && resumeAt < video.duration - 2) {
        video.currentTime = resumeAt;
      }
      applySubtitleChoice(video, initialSubtitle);
    };

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime || 0);
      setDuration(video.duration || 0);
    };

    const saveProgress = async (completed = false) => {
      if (!video.duration || Number.isNaN(video.duration)) return;
      try {
        await apiFetch("/api/history/progress", {
          method: "POST",
          body: JSON.stringify({
            animeId,
            provider,
            episodeId,
            source,
            position: video.currentTime,
            duration: video.duration,
            completed,
            animeTitle,
            animeCover,
            episodeNumber: Number.isFinite(episodeNumber) ? episodeNumber : undefined,
            episodeTitle,
          }),
        });
      } catch {
        // Ignore local save errors.
      }
    };

    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      saveProgress();
    };

    const onEnded = async () => {
      await saveProgress(true);
      if (autoplayNextRef.current && nextEpisodeHref) {
        router.push(nextEpisodeHref);
      }
    };

    const onKeyDown = (event) => {
      if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (video.paused) video.play().catch(() => null);
        else video.pause();
      }
      if (event.code === "ArrowRight") {
        video.currentTime = Math.min(video.currentTime + 10, video.duration || video.currentTime + 10);
      }
      if (event.code === "ArrowLeft") {
        video.currentTime = Math.max(video.currentTime - 10, 0);
      }
      if (event.code === "KeyM") {
        video.muted = !video.muted;
        setMuted(video.muted);
      }
      if (event.code === "KeyF") {
        if (!document.fullscreenElement) wrapperRef.current?.requestFullscreen?.().catch(() => null);
        else document.exitFullscreen?.().catch(() => null);
      }
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    window.addEventListener("beforeunload", saveProgress);
    window.addEventListener("keydown", onKeyDown);

    const interval = setInterval(saveProgress, 5000);

    return () => {
      clearInterval(interval);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      window.removeEventListener("beforeunload", saveProgress);
      window.removeEventListener("keydown", onKeyDown);
      if (hls) hls.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [
    animeCover,
    animeId,
    animeTitle,
    episodeId,
    episodeNumber,
    episodeTitle,
    nextEpisodeHref,
    preferredSubLang,
    provider,
    resumeAt,
    router,
    settings.preferredSubLang,
    source,
    stream,
    isEmbed,
  ]);

  useEffect(() => {
    if (!isEmbed || !stream?.url) return undefined;

    const targetOrigin = String(stream.embedOrigin || "").trim();
    const postPlayerPrefs = () => {
      const frame = iframeRef.current;
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage(
        {
          autoSkip: { intro: true, outro: true },
          audioLanguage: stream.audioLanguageCode || "hin",
        },
        targetOrigin || "*",
      );
    };

    const onMessage = (event) => {
      if (targetOrigin && event.origin !== targetOrigin) return;
      if (event.data === "video_playback_completed" && autoplayNextRef.current && nextEpisodeHref) {
        router.push(nextEpisodeHref);
      }
    };

    const interval = setInterval(postPlayerPrefs, 1000);
    window.addEventListener("message", onMessage);

    return () => {
      clearInterval(interval);
      window.removeEventListener("message", onMessage);
    };
  }, [isEmbed, nextEpisodeHref, router, stream]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls) return;
    if (quality === "auto") hls.currentLevel = -1;
    else hls.currentLevel = Number(quality);
  }, [quality]);

  const progressPercent = useMemo(() => {
    if (!duration) return 0;
    return Math.min(100, Math.max(0, (currentTime / duration) * 100));
  }, [currentTime, duration]);

  const skip = (seconds) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min((video.duration || 1e9), video.currentTime + seconds));
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => null);
    else video.pause();
  };

  const setPlaybackRate = (value) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = value;
    setSpeed(value);
  };

  const onSeek = (value) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Number(value);
    video.currentTime = next;
    setCurrentTime(next);
  };

  const onVolume = (value) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Number(value);
    video.volume = next;
    video.muted = next === 0;
    setVolume(next);
    setMuted(video.muted);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await wrapperRef.current?.requestFullscreen?.().catch(() => null);
    } else {
      await document.exitFullscreen?.().catch(() => null);
    }
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      // ignore pip errors
    }
  };

  return (
    <div ref={wrapperRef} className={`space-y-2 ${theater ? "bg-black p-2" : ""}`}>
      <div className={`relative overflow-hidden ${theater ? "rounded-none" : "rounded-xl border border-zinc-800"}`}>
        {isEmbed ? (
          <iframe
            ref={iframeRef}
            src={stream.url}
            className="aspect-video w-full bg-black"
            sandbox="allow-same-origin allow-scripts allow-forms allow-presentation"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="origin"
            onLoad={() => {
              const frame = iframeRef.current;
              if (!frame?.contentWindow) return;
              frame.contentWindow.postMessage(
                {
                  autoSkip: { intro: true, outro: true },
                  audioLanguage: stream.audioLanguageCode || "hin",
                },
                stream.embedOrigin || "*",
              );
            }}
          />
        ) : (
          <>
            <video
              ref={videoRef}
              className="aspect-video w-full bg-black"
              playsInline
              crossOrigin="anonymous"
              autoPlay
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
          </>
        )}
      </div>

      {isEmbed ? (
        <div className="glass space-y-3 rounded-xl p-3">
          <div className="flex flex-wrap items-center gap-2">
            {stream.audioLanguageLabel ? (
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
                Audio: {stream.audioLanguageLabel}
              </span>
            ) : null}
            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300">
              AnimeSalt Embed
            </span>
            <label className="ml-auto inline-flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={autoplayNext}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAutoplayNext(checked);
                  setSettings((current) => ({ ...current, autoplayNext: checked }));
                }}
              />
              Autoplay next
            </label>
            <Button size="icon" variant="ghost" onClick={() => setTheater((v) => !v)} title="Theater mode">
              {theater ? <Minimize size={16} /> : <Maximize size={16} />}
            </Button>
            <Button size="icon" variant="ghost" onClick={toggleFullscreen} title="Fullscreen">
              <Maximize size={16} />
            </Button>
          </div>
          <p className="text-xs text-zinc-500">
            This source uses AnimeSalt&apos;s own player so its multi-language audio and auto-skip behavior stay intact.
          </p>
        </div>
      ) : (
        <div className="glass space-y-3 rounded-xl p-3">
          <div className="space-y-1">
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={(e) => onSeek(e.target.value)}
              className="w-full accent-cyan-300"
            />
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="icon" variant="secondary" onClick={() => skip(-10)} title="Back 10s">
              <Rewind size={16} />
            </Button>
            <Button size="icon" onClick={togglePlay} title="Play/Pause">
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </Button>
            <Button size="icon" variant="secondary" onClick={() => skip(10)} title="Forward 10s">
              <FastForward size={16} />
            </Button>

            <Button size="icon" variant="ghost" onClick={toggleMute} title="Mute">
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </Button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => onVolume(e.target.value)}
              className="w-24 accent-cyan-300"
            />

            <select
              value={speed}
              onChange={(e) => setPlaybackRate(Number(e.target.value))}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
              title="Playback speed"
            >
              {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <option key={rate} value={rate}>
                  {rate}x
                </option>
              ))}
            </select>

            <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1">
              <Captions size={14} className="text-zinc-400" />
              <select
                value={subtitleChoice}
                onChange={(e) => setSubtitleChoice(e.target.value)}
                className="bg-transparent text-xs outline-none"
              >
                <option value="off">Off</option>
                {(stream?.subtitles || []).map((sub, idx) => (
                  <option key={`${sub.lang || "sub"}-${idx}`} value={String(idx)}>
                    {sub.label || sub.lang || `Subtitle ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>

            {qualityOptions.length ? (
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                title="Video quality"
              >
                <option value="auto">Auto</option>
                {qualityOptions.map((item) => (
                  <option key={item.index} value={item.index}>
                    {item.label}
                  </option>
                ))}
              </select>
            ) : null}

            <label className="ml-auto inline-flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={autoplayNext}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAutoplayNext(checked);
                  setSettings((current) => ({ ...current, autoplayNext: checked }));
                }}
              />
              Autoplay next
            </label>

            <Button size="icon" variant="ghost" onClick={() => setTheater((v) => !v)} title="Theater mode">
              {theater ? <Minimize size={16} /> : <Maximize size={16} />}
            </Button>
            <Button size="icon" variant="ghost" onClick={togglePiP} title="Picture in Picture">
              <PictureInPicture2 size={16} />
            </Button>
            <Button size="icon" variant="ghost" onClick={toggleFullscreen} title="Fullscreen">
              <Maximize size={16} />
            </Button>
          </div>

          <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
