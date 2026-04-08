"use client";

import { useEffect, useMemo, useState } from "react";
import { Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import AnimeCard from "./AnimeCard";
import { apiFetch } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent } from "./ui/card";

function getItemFormat(item) {
  const raw = String(item?.format || "").toLowerCase();
  if (raw) return raw;
  return item?.kind === "movie" ? "movie" : item?.kind === "series" ? "tv" : "";
}

function buildSearchParams({ query, source, format, sort, language, platform }) {
  const params = new URLSearchParams();
  const trimmed = String(query || "").trim();

  if (trimmed) params.set("q", trimmed);
  if (source && source !== "global") params.set("source", source);

  if (source === "animesalt") {
    if (format && format !== "all") params.set("kind", format === "tv" ? "series" : format);
    if (language) params.set("language", language);
    if (platform) params.set("platform", platform);
    if (sort && sort !== "match") params.set("sort", sort);
    return params;
  }

  if (format && format !== "all") params.set("format", format);
  if (sort && sort !== "match") params.set("sort", sort);
  return params;
}

export default function SearchPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [discover, setDiscover] = useState(null);
  const [loading, setLoading] = useState(false);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [error, setError] = useState("");
  const [formatFilter, setFormatFilter] = useState("all");
  const [sortBy, setSortBy] = useState("match");
  const [sourceFilter, setSourceFilter] = useState("global");
  const [languageFilter, setLanguageFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");

  const runSearch = async (nextState) => {
    const nextQuery = String(nextState.query || "").trim();
    const params = new URLSearchParams();

    if (nextQuery) params.set("q", nextQuery);
    params.set("source", nextState.source);
    if (nextState.source === "animesalt") {
      if (nextState.language) params.set("language", nextState.language);
      if (nextState.platform) params.set("platform", nextState.platform);
      if (nextState.format !== "all") {
        params.set("kind", nextState.format === "tv" ? "series" : nextState.format);
      }
    }

    setLoading(true);
    setError("");
    setDiscover(null);
    try {
      const response = await apiFetch(`/api/search?${params.toString()}`);
      setItems(response.results || []);
    } catch (err) {
      setItems([]);
      setError(err.message || "Search failed.");
    } finally {
      setLoading(false);
    }
  };

  const loadDiscover = async () => {
    setDiscoverLoading(true);
    setError("");
    setItems([]);
    try {
      const response = await apiFetch("/api/discover/animesalt");
      setDiscover(response);
    } catch (err) {
      setDiscover(null);
      setError(err.message || "Failed to load AnimeSalt discovery.");
    } finally {
      setDiscoverLoading(false);
    }
  };

  useEffect(() => {
    const urlQuery = String(searchParams.get("q") || "");
    const urlSource = String(searchParams.get("source") || "global");
    const urlLanguage = String(searchParams.get("language") || "");
    const urlPlatform = String(searchParams.get("platform") || "");
    const urlSort = String(searchParams.get("sort") || "match");
    const urlFormat =
      urlSource === "animesalt"
        ? String(searchParams.get("kind") || "all").replace(/^series$/i, "tv")
        : String(searchParams.get("format") || "all");

    setQuery(urlQuery);
    setSourceFilter(urlSource);
    setLanguageFilter(urlLanguage);
    setPlatformFilter(urlPlatform);
    setFormatFilter(urlFormat);
    setSortBy(urlSort);

    const shouldBrowseAnimeSalt = urlSource === "animesalt" && (urlLanguage || urlPlatform || urlFormat !== "all");
    const shouldSearch =
      (urlSource === "animesalt" && (urlQuery.trim().length >= 2 || shouldBrowseAnimeSalt)) ||
      (urlSource !== "animesalt" && urlQuery.trim().length >= 2);

    if (shouldSearch) {
      runSearch({
        query: urlQuery,
        source: urlSource,
        language: urlLanguage,
        platform: urlPlatform,
        format: urlFormat,
      }).catch((err) => setError(err.message || "Search failed."));
      return;
    }

    setItems([]);

    if (urlSource === "animesalt") {
      loadDiscover().catch((err) => setError(err.message || "Failed to load AnimeSalt discovery."));
      return;
    }

    setDiscover(null);
    setError("");
  }, [searchParams]);

  const onSearch = async (event) => {
    event.preventDefault();
    const trimmed = query.trim();

    if (sourceFilter !== "animesalt" && trimmed.length < 2) {
      setError("Type at least 2 characters to search.");
      return;
    }

    if (sourceFilter === "animesalt" && trimmed.length < 2 && !languageFilter && !platformFilter && formatFilter === "all") {
      setError("Type a title or pick an AnimeSalt browse filter.");
      return;
    }

    const params = buildSearchParams({
      query: trimmed,
      source: sourceFilter,
      format: formatFilter,
      sort: sortBy,
      language: languageFilter,
      platform: platformFilter,
    });
    router.push(`/search?${params.toString()}`);
  };

  const pushBrowseState = (overrides = {}) => {
    const params = buildSearchParams({
      query,
      source: overrides.source ?? sourceFilter,
      format: overrides.format ?? formatFilter,
      sort: overrides.sort ?? sortBy,
      language: overrides.language ?? languageFilter,
      platform: overrides.platform ?? platformFilter,
    });
    router.push(`/search?${params.toString()}`);
  };

  const displayItems = useMemo(() => {
    let list = [...items];

    if (formatFilter !== "all") {
      list = list.filter((item) => getItemFormat(item) === formatFilter);
    }

    if (sourceFilter === "animesalt") {
      if (sortBy === "title") {
        list.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
      }
      return list;
    }

    if (sortBy === "score") {
      list.sort((a, b) => Number(b.averageScore || 0) - Number(a.averageScore || 0));
    } else if (sortBy === "popularity") {
      list.sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0));
    } else if (sortBy === "recent") {
      list.sort((a, b) => Number(b.seasonYear || 0) - Number(a.seasonYear || 0));
    }

    return list;
  }, [formatFilter, items, sortBy, sourceFilter]);

  const discoverFilters = discover?.filters || { languages: [], platforms: [] };
  const showAnimeSaltDiscover =
    sourceFilter === "animesalt" &&
    query.trim().length < 2 &&
    !languageFilter &&
    !platformFilter &&
    formatFilter === "all";

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-zinc-400">
          Search globally through AniList, or switch to AnimeSalt to browse dubbed anime, cartoons, and network-specific shelves.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <form onSubmit={onSearch} className="flex flex-wrap gap-2">
            <div className="relative w-full md:flex-1">
              <SearchIcon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={sourceFilter === "animesalt" ? "Search AnimeSalt titles, cartoons, movies..." : "Search anime..."}
                className="w-full pl-8"
              />
            </div>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none"
            >
              <option value="global">Global Catalog</option>
              <option value="animesalt">AnimeSalt</option>
            </select>
            <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-400">
              <SlidersHorizontal size={14} />
              Filters
            </div>
            <select
              value={formatFilter}
              onChange={(event) => setFormatFilter(event.target.value)}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none"
            >
              <option value="all">All Formats</option>
              <option value="tv">{sourceFilter === "animesalt" ? "Series" : "TV"}</option>
              <option value="movie">Movie</option>
              {sourceFilter !== "animesalt" ? (
                <>
                  <option value="ova">OVA</option>
                  <option value="ona">ONA</option>
                  <option value="special">Special</option>
                </>
              ) : null}
            </select>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none"
            >
              <option value="match">Best Match</option>
              {sourceFilter === "animesalt" ? (
                <option value="title">Title A-Z</option>
              ) : (
                <>
                  <option value="score">Top Score</option>
                  <option value="popularity">Popularity</option>
                  <option value="recent">Recent Year</option>
                </>
              )}
            </select>
            <Button type="submit" disabled={loading || discoverLoading}>
              {loading || discoverLoading ? "..." : sourceFilter === "animesalt" ? "Search / Browse" : "Search"}
            </Button>
          </form>

          {sourceFilter === "animesalt" ? (
            <div className="grid gap-2 md:grid-cols-2">
              <select
                value={languageFilter}
                onChange={(event) => setLanguageFilter(event.target.value)}
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none"
              >
                <option value="">All Languages</option>
                {discoverFilters.languages.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={platformFilter}
                onChange={(event) => setPlatformFilter(event.target.value)}
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none"
              >
                <option value="">All Platforms</option>
                {discoverFilters.platforms.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>
      ) : null}

      {showAnimeSaltDiscover ? (
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 py-5">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">AnimeSalt Discover</h2>
                <p className="text-sm text-zinc-400">
                  Browse by Indian audio language or jump straight into platform shelves like Netflix, Cartoon Network, or Crunchyroll.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Audio Language</p>
                <div className="flex flex-wrap gap-2">
                  {discoverFilters.languages.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => pushBrowseState({ source: "animesalt", language: option.value, platform: "", format: "all" })}
                      className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 transition hover:border-cyan-300/40"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Networks</p>
                <div className="flex flex-wrap gap-2">
                  {discoverFilters.platforms.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => pushBrowseState({ source: "animesalt", platform: option.value, language: "", format: "all" })}
                      className="rounded-full border border-pink-400/20 bg-pink-400/10 px-3 py-1.5 text-xs text-pink-100 transition hover:border-pink-300/40"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {discoverLoading ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-zinc-400">Loading AnimeSalt shelves...</CardContent>
            </Card>
          ) : null}

          {(discover?.sections || []).map((section) => (
            <section key={section.id} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{section.title}</h2>
                <button
                  type="button"
                  onClick={() =>
                    pushBrowseState({
                      source: "animesalt",
                      language: section.language || "",
                      platform: section.platform || "",
                      format: "all",
                    })
                  }
                  className="text-xs text-zinc-500 hover:text-zinc-200"
                >
                  Open shelf
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {section.items.slice(0, 6).map((anime) => (
                  <AnimeCard key={`discover-${section.id}-${anime.id}`} anime={anime} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {!showAnimeSaltDiscover && (query.trim().length >= 2 || sourceFilter === "animesalt") ? (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            {loading ? "Searching..." : `${displayItems.length} result${displayItems.length === 1 ? "" : "s"}`}
          </span>
          <span>{sourceFilter === "animesalt" ? "AnimeSalt Catalog" : `Query: ${query.trim()}`}</span>
        </div>
      ) : null}

      {!loading && !discoverLoading && !error && sourceFilter !== "animesalt" && query.trim().length < 2 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-zinc-400">
            Search for a title to build a clean list you can filter and sort.
          </CardContent>
        </Card>
      ) : null}

      {!loading && !discoverLoading && !error && !showAnimeSaltDiscover && sourceFilter === "animesalt" && !displayItems.length ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-zinc-400">
            No AnimeSalt matches yet. Try a different title, switch platform, or choose an audio language shelf.
          </CardContent>
        </Card>
      ) : null}

      {!showAnimeSaltDiscover ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {displayItems.map((anime) => (
            <AnimeCard key={`search-${anime.provider || "anilist"}-${anime.id}`} anime={anime} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
