"use client";

import { useEffect, useMemo, useState } from "react";
import { Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import AnimeCard from "./AnimeCard";
import { apiFetch } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent } from "./ui/card";

export default function SearchPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formatFilter, setFormatFilter] = useState("all");
  const [sortBy, setSortBy] = useState("match");

  const runSearch = async (nextQuery) => {
    const trimmed = nextQuery.trim();
    if (trimmed.length < 2) return;

    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
      setItems(response.results || []);
    } catch (err) {
      setError(err.message || "Search failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const urlQuery = String(searchParams.get("q") || "");
    const urlFormat = String(searchParams.get("format") || "all");
    const urlSort = String(searchParams.get("sort") || "match");

    setQuery(urlQuery);
    setFormatFilter(urlFormat);
    setSortBy(urlSort);

    if (urlQuery.trim().length >= 2) {
      runSearch(urlQuery).catch((err) => setError(err.message || "Search failed."));
      return;
    }

    setItems([]);
    setError("");
  }, [searchParams]);

  const onSearch = async (event) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setError("Type at least 2 characters to search.");
      return;
    }

    const params = new URLSearchParams();
    params.set("q", trimmed);
    if (formatFilter !== "all") params.set("format", formatFilter);
    if (sortBy !== "match") params.set("sort", sortBy);
    router.push(`/search?${params.toString()}`);
  };

  const displayItems = useMemo(() => {
    let list = [...items];
    if (formatFilter !== "all") {
      list = list.filter((item) => String(item.format || "").toLowerCase() === formatFilter);
    }
    if (sortBy === "score") {
      list.sort((a, b) => Number(b.averageScore || 0) - Number(a.averageScore || 0));
    } else if (sortBy === "popularity") {
      list.sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0));
    } else if (sortBy === "recent") {
      list.sort((a, b) => Number(b.seasonYear || 0) - Number(a.seasonYear || 0));
    }
    return list;
  }, [formatFilter, items, sortBy]);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-zinc-400">Search by title, keep your filters in the URL, and jump back into what matters.</p>
      </header>

      <Card>
        <CardContent className="pt-4">
          <form onSubmit={onSearch} className="flex flex-wrap gap-2">
            <div className="relative w-full md:flex-1">
              <SearchIcon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search anime..."
                className="w-full pl-8"
              />
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-400">
              <SlidersHorizontal size={14} />
              Filter
            </div>
            <select
              value={formatFilter}
              onChange={(event) => setFormatFilter(event.target.value)}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none"
            >
              <option value="all">All Formats</option>
              <option value="tv">TV</option>
              <option value="movie">Movie</option>
              <option value="ova">OVA</option>
              <option value="ona">ONA</option>
              <option value="special">Special</option>
            </select>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none"
            >
              <option value="match">Best Match</option>
              <option value="score">Top Score</option>
              <option value="popularity">Popularity</option>
              <option value="recent">Recent Year</option>
            </select>
            <Button type="submit" disabled={loading}>
              {loading ? "..." : "Search"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>
      ) : null}

      {query.trim().length >= 2 ? (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{loading ? "Searching..." : `${displayItems.length} result${displayItems.length === 1 ? "" : "s"}`}</span>
          <span>Query: {query.trim()}</span>
        </div>
      ) : null}

      {!loading && !error && query.trim().length < 2 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-zinc-400">
            Search for a title to build a clean list you can filter and sort.
          </CardContent>
        </Card>
      ) : null}

      {!loading && !error && query.trim().length >= 2 && !displayItems.length ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-zinc-400">
            No matches for <span className="text-zinc-200">{query.trim()}</span>. Try a shorter title, romaji name, or a different format filter.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {displayItems.map((anime) => (
          <AnimeCard key={`search-${anime.provider || "anilist"}-${anime.id}`} anime={anime} />
        ))}
      </div>
    </div>
  );
}
