import Link from "next/link";
import { apiFetch, stripHtml } from "../../../lib/api";
import FavoriteButton from "../../../components/FavoriteButton";
import EpisodeBrowser from "../../../components/EpisodeBrowser";
import { requireServerSession } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

function formatOptionValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (["sub", "dub", "raw"].includes(raw.toLowerCase())) return raw.toUpperCase();
  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function AnimeDetailPage({ params, searchParams }) {
  const session = await requireServerSession();
  const authHeaders = {
    Authorization: `Bearer ${session.access_token}`,
  };

  const animeId = params.id;
  const provider = String(searchParams?.provider || "anilist");
  const source = String(searchParams?.source || "");
  const translation = String(searchParams?.translation || "");

  let payload = null;
  let historyItems = [];
  let error = "";
  try {
    const query = new URLSearchParams();
    if (source) query.set("source", source);
    if (provider) query.set("provider", provider);
    if (translation) query.set("translation", translation);

    const [detailRes, historyRes] = await Promise.all([
      apiFetch(`/api/anime/${animeId}${query.toString() ? `?${query.toString()}` : ""}`, {
        headers: authHeaders,
      }),
      apiFetch(`/api/history/${animeId}?provider=${encodeURIComponent(provider)}`, {
        headers: authHeaders,
      }),
    ]);

    payload = detailRes;
    historyItems = historyRes.items || [];
  } catch (err) {
    error = err.message || "Failed to load anime detail.";
  }

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Anime</h1>
        <p className="rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>
      </div>
    );
  }

  const anime = payload?.anime;
  const episodes = payload?.episodes || [];
  const extensions = payload?.extensions || [];
  const activeSource = payload?.source || source || extensions[0] || "";
  const activeProvider = payload?.provider || provider;
  const translationOptions = payload?.translationOptions || [];
  const activeTranslation = payload?.activeTranslation || translation || "";
  const optionLabel =
    payload?.optionLabel ||
    (translationOptions.every((item) => ["sub", "dub", "raw"].includes(String(item || "").toLowerCase()))
      ? "Content Type"
      : "Audio Language");
  const sourceMeta = payload?.sourceMeta || null;
  const favorited = Boolean(payload?.favorited);

  return (
    <div className="space-y-6">
      <section className="glass grid gap-4 rounded-2xl p-4 md:grid-cols-[220px,1fr] md:p-5">
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          {anime.coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={anime.coverImage} alt={anime.title} className="h-full w-full object-cover" />
          ) : null}
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{anime.title}</h1>
          <p className="text-sm text-zinc-400">{stripHtml(anime.description)}</p>
          <div className="flex flex-wrap gap-2 text-xs text-zinc-300">
            {anime.format ? <span className="rounded-full border border-zinc-700 px-2 py-1">{anime.format}</span> : null}
            {anime.status ? <span className="rounded-full border border-zinc-700 px-2 py-1">{anime.status}</span> : null}
            {anime.episodes ? <span className="rounded-full border border-zinc-700 px-2 py-1">{anime.episodes} eps</span> : null}
            {anime.averageScore ? <span className="rounded-full border border-emerald-300/50 px-2 py-1 text-emerald-300">{anime.averageScore} score</span> : null}
          </div>
          <div className="pt-2">
            <FavoriteButton
              animeId={anime.id}
              provider={activeProvider}
              animeTitle={anime.title}
              animeCover={anime.coverImage}
              initialFavorited={favorited}
            />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Source</h2>
        <div className="flex flex-wrap gap-2">
          {extensions.map((extName) => {
            const selected = extName === activeSource;
            const nextQuery = new URLSearchParams();
            nextQuery.set("provider", activeProvider);
            nextQuery.set("source", extName);
            if (activeTranslation) nextQuery.set("translation", activeTranslation);
            return (
              <Link
                key={extName}
                href={`/anime/${animeId}?${nextQuery.toString()}`}
                className={`rounded-xl px-3 py-2 text-sm ${
                  selected ? "bg-cyan-300 text-zinc-900" : "border border-zinc-700 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {extName}
              </Link>
            );
          })}
        </div>
      </section>

      {translationOptions.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{optionLabel}</h2>
          <div className="flex flex-wrap gap-2">
            {translationOptions.map((translationName) => {
              const selected = translationName === activeTranslation;
              const nextQuery = new URLSearchParams();
              nextQuery.set("provider", activeProvider);
              nextQuery.set("source", activeSource);
              nextQuery.set("translation", translationName);
              return (
                <Link
                  key={translationName}
                  href={`/anime/${animeId}?${nextQuery.toString()}`}
                className={`rounded-xl px-3 py-2 text-sm ${
                  selected ? "bg-emerald-300 text-zinc-900" : "border border-zinc-700 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {formatOptionValue(translationName)}
              </Link>
            );
          })}
        </div>
      </section>
      ) : null}

      {sourceMeta ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Source Extras</h2>
          {Array.isArray(sourceMeta.platforms) && sourceMeta.platforms.length ? (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Platforms</p>
              <div className="flex flex-wrap gap-2">
                {sourceMeta.platforms.map((platform) => (
                  <span
                    key={platform}
                    className="rounded-full border border-pink-400/30 bg-pink-400/10 px-3 py-1 text-xs text-pink-100"
                  >
                    {platform}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {Array.isArray(sourceMeta.languages) && sourceMeta.languages.length ? (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Available Languages</p>
              <div className="flex flex-wrap gap-2">
                {sourceMeta.languages.map((language) => (
                  <span
                    key={language}
                    className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100"
                  >
                    {language}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {Array.isArray(sourceMeta.statuses) && sourceMeta.statuses.length ? (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Status</p>
              <div className="flex flex-wrap gap-2">
                {sourceMeta.statuses.map((status) => (
                  <span
                    key={status}
                    className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100"
                  >
                    {status}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <EpisodeBrowser
        animeId={animeId}
        provider={activeProvider}
        animeTitle={anime.title}
        animeCover={anime.coverImage}
        source={activeSource}
        translation={activeTranslation}
        episodes={episodes}
        historyItems={historyItems}
      />
    </div>
  );
}
