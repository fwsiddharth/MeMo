"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import AnimeCard from "./AnimeCard";
import { apiFetch } from "../lib/api";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

const NETWORK_LOGOS = {
  "disney-channel": "https://animesalt.ac/wp-content/uploads/disney-193x193.png",
  "hungama-tv": "https://animesalt.ac/wp-content/uploads/hungama-193x193.png",
  "sony-yay": "https://animesalt.ac/wp-content/uploads/sonyay-193x193.png",
  "cartoon-network": "https://animesalt.ac/wp-content/uploads/cartoonnetwork-193x193.png",
  "prime-video": "https://animesalt.ac/wp-content/uploads/primevideo-193x193.png",
  netflix: "https://animesalt.ac/wp-content/uploads/netflix-193x193.png",
  "disney-hotstar": "https://animesalt.ac/wp-content/uploads/hotstar-193x193.png",
  crunchyroll: "https://animesalt.ac/wp-content/uploads/crunchyroll-193x193.png",
};

const KIND_OPTIONS = [
  { value: "all", label: "All" },
  { value: "series", label: "Series" },
  { value: "movie", label: "Movies" },
];

function buildParams({ query, language, platform, kind }) {
  const params = new URLSearchParams();
  if (query?.trim()) params.set("q", query.trim());
  if (language) params.set("language", language);
  if (platform) params.set("platform", platform);
  if (kind && kind !== "all") params.set("kind", kind);
  return params;
}

function NetworkCard({ option, active, onClick }) {
  const logoUrl = NETWORK_LOGOS[option.value] || "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col items-center gap-3 rounded-[1.4rem] bg-transparent p-2 text-center transition ${
        active
          ? "text-cyan-200"
          : "text-zinc-300 hover:text-white"
      }`}
    >
      <div className="relative flex aspect-square w-full items-center justify-center">
        <div
          className={`anime-salt-logo-glow absolute inset-0 rounded-full ${
            active ? "bg-cyan-300/16" : "bg-white/0 group-hover:bg-cyan-300/10"
          }`}
        />
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={option.label}
            className={`anime-salt-logo relative w-full object-contain ${
              active ? "max-h-32 scale-[1.04]" : "max-h-28 group-hover:scale-[1.06]"
            }`}
            loading="lazy"
          />
        ) : (
          <p className="text-center text-xl font-semibold leading-none tracking-tight text-white">
            {option.label}
          </p>
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="line-clamp-1 text-xs font-medium">{option.label}</p>
        <span
          className={`h-1 rounded-full transition-all ${
            active ? "w-10 bg-cyan-300" : "w-0 bg-transparent group-hover:w-6 group-hover:bg-zinc-500"
          }`}
        />
      </div>
    </button>
  );
}

function Shelf({ title, subtitle, items = [] }) {
  if (!items.length) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
          {subtitle ? <p className="text-sm text-zinc-500">{subtitle}</p> : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((anime) => (
          <AnimeCard key={`${title}-${anime.id}`} anime={anime} />
        ))}
      </div>
    </section>
  );
}

export default function AnimeSaltHubClient({ discover }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [platform, setPlatform] = useState("");
  const [kind, setKind] = useState("all");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filters = discover?.filters || { languages: [], platforms: [] };
  const sections = discover?.sections || [];

  useEffect(() => {
    const nextQuery = String(searchParams.get("q") || "");
    const nextLanguage = String(searchParams.get("language") || "");
    const nextPlatform = String(searchParams.get("platform") || "");
    const nextKind = String(searchParams.get("kind") || "all");

    setQuery(nextQuery);
    setLanguage(nextLanguage);
    setPlatform(nextPlatform);
    setKind(nextKind);

    const shouldRun = nextQuery.trim().length >= 2 || nextLanguage || nextPlatform || nextKind !== "all";
    if (!shouldRun) {
      setResults([]);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    apiFetch(`/api/search?source=animesalt&${buildParams({ query: nextQuery, language: nextLanguage, platform: nextPlatform, kind: nextKind }).toString()}`)
      .then((response) => {
        setResults(response.results || []);
      })
      .catch((err) => {
        setResults([]);
        setError(err.message || "AnimeSalt catalog failed to load.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [searchParams]);

  const activeLanguageLabel = useMemo(
    () => filters.languages.find((item) => item.value === language)?.label || "",
    [filters.languages, language],
  );
  const activePlatformLabel = useMemo(
    () => filters.platforms.find((item) => item.value === platform)?.label || "",
    [filters.platforms, platform],
  );

  const updateRoute = (overrides = {}) => {
    const params = buildParams({
      query: overrides.query ?? query,
      language: overrides.language ?? language,
      platform: overrides.platform ?? platform,
      kind: overrides.kind ?? kind,
    });
    const suffix = params.toString();
    router.push(suffix ? `/animesalt?${suffix}` : "/animesalt");
  };

  const showingResults = query.trim().length >= 2 || language || platform || kind !== "all";

  return (
    <div className="space-y-8">
      <section className="glass rounded-[2rem] px-5 py-5 md:px-6 md:py-6">
        <div className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
                AnimeSalt Catalog
              </p>
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-white md:text-4xl">
                  Browse dubbed anime, cartoons, and movie shelves.
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-zinc-400">
                  Search directly, switch audio language, or jump into a network shelf.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {KIND_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateRoute({ kind: option.value })}
                  className={`rounded-full px-3 py-1.5 text-xs transition ${
                    kind === option.value
                      ? "bg-cyan-300 text-zinc-950"
                      : "border border-zinc-700/80 bg-zinc-950/50 text-zinc-300 hover:border-zinc-500"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              updateRoute();
            }}
            className="flex flex-col gap-3 lg:flex-row"
          >
            <div className="relative min-w-0 flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search AnimeSalt titles, cartoons, movies..."
                className="h-12 rounded-2xl border-white/10 bg-zinc-950/70 pl-9"
              />
            </div>
            <Button type="submit" className="h-12 rounded-2xl px-6">
              Search AnimeSalt
            </Button>
          </form>

          <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
            {activeLanguageLabel ? (
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-cyan-100">
                {activeLanguageLabel}
              </span>
            ) : null}
            {activePlatformLabel ? (
              <span className="rounded-full border border-pink-300/20 bg-pink-300/10 px-3 py-1.5 text-pink-100">
                {activePlatformLabel}
              </span>
            ) : null}
            {kind !== "all" ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-200">
                {KIND_OPTIONS.find((item) => item.value === kind)?.label}
              </span>
            ) : null}
            {!activeLanguageLabel && !activePlatformLabel && kind === "all" ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-400">
                Start with search, language, or a network below.
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="glass rounded-[2rem] px-5 py-5 md:px-6">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Audio Language</p>
          <h2 className="text-lg font-semibold text-white">Curate the catalog by language</h2>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateRoute({ language: "", platform: platform, kind, query })}
            className={`rounded-full px-3 py-1.5 text-xs transition ${
              !language ? "bg-cyan-300 text-zinc-950" : "border border-zinc-700 text-zinc-300 hover:border-zinc-500"
            }`}
          >
            All Languages
          </button>
          {filters.languages.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updateRoute({ language: option.value })}
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                language === option.value
                  ? "bg-cyan-300 text-zinc-950"
                  : "border border-zinc-700 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="glass rounded-[2rem] px-5 py-5 md:px-6">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Networks</p>
          <h2 className="text-lg font-semibold text-white">Open a platform shelf</h2>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
          {filters.platforms.map((option) => (
            <NetworkCard
              key={option.value}
              option={option}
              active={platform === option.value}
              onClick={() => updateRoute({ platform: option.value })}
            />
          ))}
        </div>
      </section>

      {showingResults ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight text-white">AnimeSalt Results</h2>
              <p className="text-sm text-zinc-500">
                {[
                  query.trim() ? `Query: ${query.trim()}` : "",
                  activeLanguageLabel,
                  activePlatformLabel,
                  kind !== "all" ? KIND_OPTIONS.find((item) => item.value === kind)?.label : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "Filtered source-native results"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/animesalt")}
              className="text-xs text-zinc-500 hover:text-zinc-200"
            >
              Clear filters
            </button>
          </div>

          {error ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-red-200">{error}</CardContent>
            </Card>
          ) : null}

          {loading ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-zinc-400">Loading AnimeSalt catalog...</CardContent>
            </Card>
          ) : null}

          {!loading && !error && !results.length ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-zinc-400">
                No AnimeSalt titles matched this combination. Try a different query or another network shelf.
              </CardContent>
            </Card>
          ) : null}

          {!loading && results.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {results.map((anime) => (
                <AnimeCard key={`animesalt-result-${anime.id}`} anime={anime} />
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <Shelf
              key={section.id}
              title={section.title}
              subtitle="Source-native shelf from AnimeSalt"
              items={section.items}
            />
          ))}
        </div>
      )}
    </div>
  );
}
