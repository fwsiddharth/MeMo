"use client";

import { useState } from "react";
import { apiFetch } from "../lib/api";

export default function FavoriteButton({
  animeId,
  provider = "anilist",
  animeTitle,
  animeCover,
  initialFavorited = false,
}) {
  const [favorited, setFavorited] = useState(Boolean(initialFavorited));
  const [loading, setLoading] = useState(false);

  const onToggle = async () => {
    if (loading) return;
    setLoading(true);
    const next = !favorited;
    try {
      if (next) {
        await apiFetch("/api/favorites", {
          method: "POST",
          body: JSON.stringify({ animeId, provider, animeTitle, animeCover }),
        });
      } else {
        await apiFetch(
          `/api/favorites/${encodeURIComponent(animeId)}?provider=${encodeURIComponent(provider)}`,
          {
          method: "DELETE",
          },
        );
      }
      setFavorited(next);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={loading}
      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
        favorited
          ? "bg-pink-300 text-zinc-900 hover:bg-pink-200"
          : "border border-zinc-700 text-zinc-200 hover:border-zinc-500"
      } disabled:opacity-60`}
    >
      {favorited ? "In Favorites" : "Add Favorite"}
    </button>
  );
}
