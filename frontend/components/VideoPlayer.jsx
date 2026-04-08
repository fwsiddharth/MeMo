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
  Settings,
  X,
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
  const controlsTimeoutRef = useRef(null);

  const { settings, setSettings } = useClientSettings();

  const [playing, setPlaying] = useState(false);
  const [autoplayNext, setAutoplayNext] = useState(Boolean(settings.autoplayNext ?? autoplayNextDefault));
  const [speed, setSpeed] = useState(1);
  const [subtitleChoice, setSubtitleChoice] = useState("off");
  const [quality, setQuality] = useState("auto");
  const [qualityOptions, setQualityOptions] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [theater, setTheater] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  // Caption Customization State
  const [captionsMenuOpen, setCaptionsMenuOpen] = useState(false);
  const [captionColor, setCaptionColor] = useState(settings.captionColor || "#ffffff");
  const [captionBg, setCaptionBg] = useState(settings.captionBg || "rgba(0,0,0,1)");
  const [captionBgOpacity, setCaptionBgOpacity] = useState(settings.captionBgOpacity || "75%");
  const [captionSize, setCaptionSize] = useState(settings.captionSize || "100%");
  const [captionFont, setCaptionFont] = useState(settings.captionFont || "sans-serif");
  const [captionEdge, setCaptionEdge] = useState(settings.captionEdge || "drop-shadow");

  const updateCaptionSetting = (key, value) => {
    if (key === 'color') setCaptionColor(value);
    if (key === 'bg') setCaptionBg(value);
    if (key === 'bgOp') setCaptionBgOpacity(value);
    if (key === 'size') setCaptionSize(value);
    if (key === 'font') setCaptionFont(value);
    if (key === 'edge') setCaptionEdge(value);
    
    setSettings((current) => ({
      ...current,
      captionColor: key === 'color' ? value : current.captionColor,
      captionBg: key === 'bg' ? value : current.captionBg,
      captionBgOpacity: key === 'bgOp' ? value : current.captionBgOpacity,
      captionSize: key === 'size' ? value : current.captionSize,
      captionFont: key === 'font' ? value : current.captionFont,
      captionEdge: key === 'edge' ? value : current.captionEdge,
    }));
  };

  const isEmbed = String(stream?.type || "").toLowerCase() === "embed";

  const showControls = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (playing && !captionsMenuOpen) setControlsVisible(false);
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

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

    const onPlay = () => {
      setPlaying(true);
      showControls();
    };
    const onPause = () => {
      setPlaying(false);
      setControlsVisible(true);
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
      showControls();
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

    const declaredOrigin = String(stream.embedOrigin || "").trim();
    const getFrameOrigin = () => {
      const frame = iframeRef.current;
      if (!frame?.src) return "";
      try {
        return new URL(frame.src, window.location.origin).origin;
      } catch {
        return "";
      }
    };

    const getTargetOrigin = () => {
      const frameOrigin = getFrameOrigin();
      if (declaredOrigin && frameOrigin && declaredOrigin === frameOrigin) return declaredOrigin;
      if (frameOrigin) return frameOrigin;
      return declaredOrigin || "*";
    };

    const postPlayerPrefs = () => {
      const frame = iframeRef.current;
      if (!frame?.contentWindow) return;
      try {
        frame.contentWindow.postMessage(
          {
            autoSkip: { intro: true, outro: true },
            audioLanguage: stream.audioLanguageCode || "hin",
          },
          getTargetOrigin(),
        );
      } catch {
        // ignore cross-origin issues
      }
    };

    const onMessage = (event) => {
      const frame = iframeRef.current;
      if (frame?.contentWindow && event.source !== frame.contentWindow) return;

      const frameOrigin = getFrameOrigin();
      if (
        declaredOrigin &&
        event.origin !== declaredOrigin &&
        (!frameOrigin || event.origin !== frameOrigin)
      ) {
        return;
      }

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
    video.currentTime = Math.max(0, Math.min(video.duration || 1e9, video.currentTime + seconds));
    showControls();
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => null);
    else video.pause();
    showControls();
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

    if (video.muted || video.volume === 0 || volume === 0) {
      video.muted = false;
      if (video.volume === 0 || volume === 0) {
        video.volume = 1;
        setVolume(1);
      }
    } else {
      video.muted = true;
    }
    
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
    <div
      ref={wrapperRef}
      className={`relative w-full flex items-center justify-center bg-black overflow-hidden group ${
        theater ? "rounded-none" : "rounded-xl border border-zinc-800"
      }`}
      onMouseMove={showControls}
      onMouseLeave={() => playing && !captionsMenuOpen && setControlsVisible(false)}
      onClick={(e) => {
        if (!controlsVisible) showControls();
        else if (e.target.tagName !== "BUTTON" && e.target.tagName !== "INPUT" && e.target.tagName !== "SELECT" && !e.target.closest('.controls-panel')) {
            togglePlay();
        }
      }}
    >
      <style jsx global>{`
        video::cue {
          color: ${captionColor};
          background-color: ${captionBg === 'transparent' ? 'transparent' : `color-mix(in srgb, ${captionBg} ${captionBgOpacity}, transparent)`};
          font-size: ${captionSize};
          font-family: ${captionFont};
          text-shadow: ${
            captionEdge === "none" ? "none" :
            captionEdge === "outline" ? "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000" :
            captionEdge === "raised" ? "1px 1px 0 #000, 2px 2px 0 #000" :
            "1px 1px 2px black"
          };
        }
      `}</style>

      {isEmbed ? (
        <iframe
          ref={iframeRef}
          src={stream.url}
          className="aspect-video w-full"
          sandbox="allow-same-origin allow-scripts allow-forms allow-presentation"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          referrerPolicy="origin"
        />
      ) : (
        <video
          ref={videoRef}
          className="aspect-video w-full"
          playsInline
          crossOrigin="anonymous"
          autoPlay
          onClick={(e) => e.stopPropagation()} // Handle play/pause toggle at wrapper level
        />
      )}

      {/* On-Player Overlay Controls */}
      {!isEmbed && (
        <div
          className={`controls-panel absolute inset-0 flex flex-col justify-between transition-opacity duration-300 pointer-events-none ${
            controlsVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="w-full bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 flex justify-between items-start pointer-events-auto">
               <div className="flex-1"></div>
          </div>

          {/* Center play button */}
          <div className="flex items-center justify-center flex-1 pointer-events-auto">
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="bg-black/50 hover:bg-cyan-500/80 text-white rounded-full p-4 backdrop-blur-md transition-all drop-shadow-2xl"
            >
              {playing ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" />}
            </button>
          </div>

          {/* Bottom Controls Bar */}
          <div className="w-full bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-12 pb-4 px-4 pointer-events-auto">
            <div className="space-y-2">
              {/* Progress Bar */}
              <div className="group/progress relative h-1.5 w-full bg-white/20 rounded-full cursor-pointer overflow-hidden backdrop-blur-sm self-end">
                 <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => onSeek(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />
                <div
                  className="absolute top-0 left-0 h-full bg-cyan-400 rounded-full pointer-events-none transition-all duration-75"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Controls Row */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-4">
                  <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="text-white hover:text-cyan-400 transition">
                    {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); skip(-10); }} className="text-white hover:text-cyan-400 transition" title="Back 10s">
                    <Rewind size={18} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); skip(10); }} className="text-white hover:text-cyan-400 transition" title="Forward 10s">
                    <FastForward size={18} />
                  </button>
                  
                  {/* Volume Control */}
                  <div className="group/volume flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="text-white hover:text-cyan-400 transition" title="Mute/Unmute">
                      {muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={muted ? 0 : volume}
                      onChange={(e) => onVolume(e.target.value)}
                      className="w-0 opacity-0 group-hover/volume:w-20 group-hover/volume:opacity-100 transition-all duration-300 accent-cyan-400"
                    />
                  </div>
                  
                  <div className="text-xs text-zinc-300 font-medium">
                    {formatTime(currentTime)} <span className="text-zinc-500 mx-1">/</span> {formatTime(duration)}
                  </div>
                </div>

                <div className="flex items-center gap-5">
                     {/* Subtitles/Captions Toggle (Unified Menu) */}
                     <div className="relative flex items-center">
                         <button 
                             onClick={(e) => {
                                 e.stopPropagation();
                                 setCaptionsMenuOpen(!captionsMenuOpen);
                             }}
                             className={`transition hover:scale-105 ${captionsMenuOpen || subtitleChoice !== "off" ? "text-cyan-400" : "text-white hover:text-cyan-400"}`}
                             title="Subtitles & Settings"
                         >
                             <Captions size={20} />
                         </button>
                     </div>

                    {/* Playback speed */}
                    <div className="relative flex items-center">
                        <span className="text-xs font-semibold text-white">{speed}x</span>
                        <select
                            value={speed}
                            onChange={(e) => { e.stopPropagation(); setPlaybackRate(Number(e.target.value)); }}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            title="Speed"
                        >
                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                            <option key={rate} value={rate}>{rate}x</option>
                        ))}
                        </select>
                    </div>

                    {/* Quality */}
                    {qualityOptions.length > 0 && (
                        <div className="relative flex items-center">
                        <span className="text-xs font-semibold text-white">{quality === 'auto' ? 'Auto' : qualityOptions.find(q => String(q.index) === String(quality))?.label}</span>
                        <select
                            value={quality}
                            onChange={(e) => { e.stopPropagation(); setQuality(e.target.value); }}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            title="Quality"
                        >
                            <option value="auto">Auto</option>
                            {qualityOptions.map((item) => (
                            <option key={item.index} value={item.index}>{item.label}</option>
                            ))}
                        </select>
                        </div>
                    )}

                    {/* Picture in Picture */}
                    <button onClick={(e) => { e.stopPropagation(); togglePiP(); }} className="text-white hover:text-cyan-400 transition" title="PiP">
                        <PictureInPicture2 size={18} />
                    </button>

                    {/* Theater */}
                    <button onClick={(e) => { e.stopPropagation(); setTheater((v) => !v); }} className="text-white hover:text-cyan-400 transition" title="Theater Mode">
                        {theater ? <Minimize size={18} /> : <Maximize size={18} />}
                    </button>

                    {/* Fullscreen */}
                    <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className="text-white hover:text-cyan-400 transition" title="Fullscreen">
                        <Maximize size={20} />
                    </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unified Caption & Settings Panel Overlay */}
      {captionsMenuOpen && (
         <div 
             className="absolute right-4 bottom-24 bg-zinc-900/95 border border-zinc-700/80 backdrop-blur-2xl p-5 rounded-2xl shadow-2xl z-50 w-80 controls-panel text-white pointer-events-auto transform transition-all max-h-[350px] overflow-y-auto custom-scrollbar"
             onClick={(e) => e.stopPropagation()}
         >
             <div className="flex items-center justify-between mb-5 pb-3 border-b border-zinc-800">
                 <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Captions size={16} className="text-cyan-400"/> Subtitles & Settings
                 </h3>
                 <button onClick={() => setCaptionsMenuOpen(false)} className="text-zinc-400 hover:text-white transition"><X size={16}/></button>
             </div>
             
             <div className="space-y-6">
                 {/* Track Selection */}
                 <div className="space-y-2.5">
                     <label className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Select Track</label>
                     <div className="grid grid-cols-2 gap-2">
                        <button 
                            onClick={() => setSubtitleChoice("off")}
                            className={`px-3 py-2 text-xs rounded-lg border transition ${subtitleChoice === "off" ? "bg-cyan-500/10 border-cyan-400 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.1)]" : "bg-zinc-800/40 border-transparent text-zinc-400 hover:bg-zinc-700"}`}
                        >
                            Off
                        </button>
                        {(stream?.subtitles || []).map((sub, idx) => {
                            const active = subtitleChoice === String(idx);
                             return (
                                <button 
                                    key={idx}
                                    onClick={() => setSubtitleChoice(String(idx))}
                                    className={`px-3 py-2 text-xs rounded-lg border text-left truncate transition ${active ? "bg-cyan-500/10 border-cyan-400 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.1)]" : "bg-zinc-800/40 border-transparent text-zinc-400 hover:bg-zinc-700"}`}
                                    title={sub.label || sub.lang}
                                >
                                    {sub.label || sub.lang || `Track ${idx + 1}`}
                                </button>
                             );
                        })}
                     </div>
                 </div>

                 {/* Customization Options */}
                 {subtitleChoice !== "off" && (
                    <div className="space-y-5 pt-4 border-t border-zinc-800/60">
                        <label className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold block mb-1">Appearance</label>
                        
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-zinc-300">Text Color</span>
                            </div>
                            <div className="flex gap-2.5">
                                {['#ffffff', '#facc15', '#38bdf8', '#4ade80', '#fb7185'].map(c => (
                                    <button 
                                        key={c}
                                        onClick={() => updateCaptionSetting('color', c)} 
                                        className={`w-6 h-6 rounded-full border-2 transition-transform ${captionColor === c ? 'border-white scale-110 shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'border-transparent opacity-70 hover:opacity-100'}`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <span className="text-xs text-zinc-300">Background Color</span>
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { name: 'Dark', val: 'rgba(0,0,0,1)' },
                                    { name: 'Red', val: 'rgba(185,28,28,1)' },
                                    { name: 'Blue', val: 'rgba(3,105,161,1)' },
                                    { name: 'None', val: 'transparent' }
                                ].map(bg => (
                                    <button
                                        key={bg.name}
                                        onClick={() => updateCaptionSetting('bg', bg.val)}
                                        className={`px-2 py-1.5 text-xs rounded-md transition ${captionBg === bg.val ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50' : 'bg-zinc-800 text-zinc-400 border border-transparent hover:bg-zinc-700'}`}
                                    >
                                        {bg.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span className="text-xs text-zinc-300">Bg Opacity</span>
                                <span className="text-xs font-mono text-cyan-400">{captionBgOpacity}</span>
                            </div>
                            <input 
                                type="range"
                                min="0" max="100" step="5"
                                value={parseInt(captionBgOpacity) || 75}
                                onChange={(e) => updateCaptionSetting('bgOp', `${e.target.value}%`)}
                                className="w-full accent-cyan-400 h-1.5 bg-zinc-800 rounded-lg outline-none appearance-none cursor-pointer"
                                disabled={captionBg === 'transparent'}
                            />
                        </div>

                        <div className="space-y-2">
                            <span className="text-xs text-zinc-300">Font Family</span>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { name: 'Sans Serif', val: 'sans-serif' },
                                    { name: 'Serif', val: 'serif' },
                                    { name: 'Monospace', val: 'monospace' },
                                    { name: 'Casual', val: 'cursive' }
                                ].map(f => (
                                    <button
                                        key={f.name}
                                        onClick={() => updateCaptionSetting('font', f.val)}
                                        className={`px-2 py-1.5 text-xs rounded-md transition truncate ${captionFont === f.val ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50' : 'bg-zinc-800 text-zinc-400 border border-transparent hover:bg-zinc-700'}`}
                                        style={{ fontFamily: f.val }}
                                    >
                                        {f.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <span className="text-xs text-zinc-300">Text Edge</span>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { name: 'Shadow', val: 'drop-shadow' },
                                    { name: 'Outline', val: 'outline' },
                                    { name: 'Raised', val: 'raised' },
                                    { name: 'None', val: 'none' }
                                ].map(e => (
                                    <button
                                        key={e.name}
                                        onClick={() => updateCaptionSetting('edge', e.val)}
                                        className={`px-2 py-1.5 text-xs rounded-md transition ${captionEdge === e.val ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50' : 'bg-zinc-800 text-zinc-400 border border-transparent hover:bg-zinc-700'}`}
                                    >
                                        {e.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span className="text-xs text-zinc-300">Text Size</span>
                                <span className="text-xs font-mono text-cyan-400">{captionSize}</span>
                            </div>
                            <input 
                                type="range"
                                min="50" max="300" step="10"
                                value={parseInt(captionSize) || 100}
                                onChange={(e) => updateCaptionSetting('size', `${e.target.value}%`)}
                                className="w-full accent-cyan-400 h-1.5 bg-zinc-800 rounded-lg outline-none appearance-none cursor-pointer"
                            />
                        </div>
                    </div>
                 )}
             </div>
         </div>
      )}

    </div>
  );
}
