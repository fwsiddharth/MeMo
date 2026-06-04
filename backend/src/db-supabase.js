const { createClient } = require("@supabase/supabase-js");

const DEFAULT_SETTINGS = {
  sidebar_compact: "1",
  autoplay_next: "1",
  preferred_sub_lang: "en",
  ui_animations: "1",
};

let supabase = null;

function getSupabaseClient() {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase database env is missing.");
  }

  supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabase;
}

function boolToSetting(value, defaultValue = true) {
  return (value ?? (defaultValue ? "1" : "0")) === "1";
}

function toMillis(value) {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const numeric = Number(value);
  if (Number.isFinite(numeric) && String(value).trim() !== "") {
    return numeric;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function normalizeSettingsRow(row) {
  const settings =
    row?.settings && typeof row.settings === "object" && !Array.isArray(row.settings)
      ? row.settings
      : {};

  return {
    sidebarCompact: typeof settings.sidebarCompact === "boolean" ? settings.sidebarCompact : true,
    autoplayNext: typeof settings.autoplayNext === "boolean" ? settings.autoplayNext : true,
    preferredSubLang: typeof settings.preferredSubLang === "string" && settings.preferredSubLang.trim()
      ? settings.preferredSubLang
      : "en",
    uiAnimations: typeof settings.uiAnimations === "boolean" ? settings.uiAnimations : true,
  };
}

function mapHistoryRow(row) {
  if (!row) return null;
  return {
    animeId: row.anime_id,
    provider: row.provider || "anilist",
    episodeId: row.episode_id,
    source: row.source || null,
    position: Number(row.position || 0),
    duration: Number(row.duration || 0),
    completed: Boolean(row.completed),
    animeTitle: row.anime_title || null,
    animeCover: row.anime_cover || null,
    episodeNumber: Number.isFinite(Number(row.episode_number)) ? Number(row.episode_number) : null,
    episodeTitle: row.episode_title || null,
    updatedAt: toMillis(row.updated_at),
  };
}

function mapFavoriteRow(row) {
  if (!row) return null;
  return {
    animeId: row.anime_id,
    provider: row.provider || "anilist",
    animeTitle: row.anime_title || null,
    animeCover: row.anime_cover || null,
    addedAt: toMillis(row.created_at || row.added_at),
  };
}

function mapTrackerRow(row) {
  if (!row) return null;
  return {
    provider: row.provider,
    connected: Boolean(row.connected),
    username: row.username || null,
    updatedAt: toMillis(row.updated_at),
  };
}

function ensureNoError(error, fallbackMessage) {
  if (error) {
    throw new Error(error.message || fallbackMessage);
  }
}

async function ensureSeedSettings(userId) {
  const client = getSupabaseClient();
  const { error } = await client
    .from("user_settings")
    .upsert(
      {
        user_id: userId,
        settings: {
          sidebarCompact: true,
          autoplayNext: true,
          preferredSubLang: "en",
          uiAnimations: true,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  ensureNoError(error, "Failed to seed settings.");
}

async function initDb() {
  const client = getSupabaseClient();
  const probes = await Promise.all([
    client.from("users").select("id").limit(1),
    client.from("history").select("id").limit(1),
    client.from("user_settings").select("user_id").limit(1),
  ]);

  for (const { error } of probes) {
    if (error) {
      throw new Error(
        `Supabase schema is missing or unreachable. Run backend/supabase/schema.sql first. (${error.message})`,
      );
    }
  }
}

async function saveProgress(input, userId) {
  const completed = Boolean(input.completed);
  const duration = Number(input.duration || 0);
  const position = completed ? duration : Number(input.position || 0);

  const payload = {
    user_id: userId,
    anime_id: input.animeId,
    provider: input.provider || "anilist",
    episode_id: input.episodeId,
    source: input.source || "default",
    position,
    duration,
    completed,
    anime_title: input.animeTitle || null,
    anime_cover: input.animeCover || null,
    episode_number: Number.isFinite(input.episodeNumber) ? input.episodeNumber : null,
    episode_title: input.episodeTitle || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await getSupabaseClient()
    .from("history")
    .upsert(payload, { onConflict: "user_id,anime_id,episode_id" });

  ensureNoError(error, "Failed to save progress.");
}

async function getContinueWatching(userId, limit = 24) {
  const { data, error } = await getSupabaseClient()
    .from("history")
    .select("*")
    .eq("user_id", userId)
    .eq("completed", false)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, Number(limit) || 24)));

  ensureNoError(error, "Failed to load continue watching.");
  return (data || []).map(mapHistoryRow);
}

async function getAnimeHistory(userId, animeId, provider = "anilist") {
  const { data, error } = await getSupabaseClient()
    .from("history")
    .select("*")
    .eq("user_id", userId)
    .eq("anime_id", animeId)
    .eq("provider", provider)
    .order("episode_number", { ascending: true })
    .order("updated_at", { ascending: false });

  ensureNoError(error, "Failed to load anime history.");
  return (data || []).map(mapHistoryRow);
}

async function getRecentHistory(userId, limit = 60) {
  const { data, error } = await getSupabaseClient()
    .from("history")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, Number(limit) || 60)));

  ensureNoError(error, "Failed to load recent history.");
  return (data || []).map(mapHistoryRow);
}

async function getResume(userId, animeId, episodeId, source = "default", provider = "anilist") {
  let item = null;

  if (source && source !== "default") {
    const { data, error } = await getSupabaseClient()
      .from("history")
      .select("*")
      .eq("user_id", userId)
      .eq("anime_id", animeId)
      .eq("provider", provider)
      .eq("episode_id", episodeId)
      .eq("source", source)
      .limit(1)
      .maybeSingle();

    ensureNoError(error, "Failed to load resume progress.");
    item = mapHistoryRow(data);
  }

  if (!item) {
    const { data, error } = await getSupabaseClient()
      .from("history")
      .select("*")
      .eq("user_id", userId)
      .eq("anime_id", animeId)
      .eq("provider", provider)
      .eq("episode_id", episodeId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    ensureNoError(error, "Failed to load resume progress.");
    item = mapHistoryRow(data);
  }

  if (!item || item.completed) return null;
  if (item.duration > 0 && item.position >= item.duration * 0.95) return null;
  return item;
}

async function addFavorite(input, userId) {
  const payload = {
    user_id: userId,
    anime_id: input.animeId,
    provider: input.provider || "anilist",
    anime_title: input.animeTitle || null,
    anime_cover: input.animeCover || null,
    created_at: new Date().toISOString(),
  };

  const { error } = await getSupabaseClient()
  .from("favorites")
    .upsert(payload, { onConflict: "user_id,anime_id,provider" });

  ensureNoError(error, "Failed to save favorite.");
}

async function removeFavorite(animeId, provider = "anilist", userId) {
  const { error } = await getSupabaseClient()
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("anime_id", animeId)
    .eq("provider", provider);

  ensureNoError(error, "Failed to remove favorite.");
}

async function isFavorite(animeId, provider = "anilist", userId) {
  const { data, error } = await getSupabaseClient()
    .from("favorites")
    .select("anime_id")
    .eq("user_id", userId)
    .eq("anime_id", animeId)
    .eq("provider", provider)
    .limit(1)
    .maybeSingle();

  ensureNoError(error, "Failed to check favorite.");
  return Boolean(data?.anime_id);
}

async function listFavorites(userId, limit = 100) {
  const { data, error } = await getSupabaseClient()
    .from("favorites")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(500, Number(limit) || 100)));

  ensureNoError(error, "Failed to load favorites.");
  return (data || []).map(mapFavoriteRow);
}

async function getSettings(userId) {
  await ensureSeedSettings(userId);

  const { data, error } = await getSupabaseClient()
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId);

  ensureNoError(error, "Failed to load settings.");
  return normalizeSettingsRow(data?.[0] || null);
}

async function updateSettings(input, userId) {
  await ensureSeedSettings(userId);
  const current = await getSettings(userId);
  const next = {
    ...current,
    ...(typeof input.sidebarCompact === "boolean" ? { sidebarCompact: input.sidebarCompact } : null),
    ...(typeof input.autoplayNext === "boolean" ? { autoplayNext: input.autoplayNext } : null),
    ...(typeof input.preferredSubLang === "string"
      ? { preferredSubLang: input.preferredSubLang || "en" }
      : null),
    ...(typeof input.uiAnimations === "boolean" ? { uiAnimations: input.uiAnimations } : null),
  };

  const { error } = await getSupabaseClient()
    .from("user_settings")
    .upsert(
      {
        user_id: userId,
        settings: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  ensureNoError(error, "Failed to update settings.");
}

async function listTrackers(userId) {
  const { data, error } = await getSupabaseClient()
    .from("trackers")
    .select("*")
    .eq("user_id", userId)
    .order("provider", { ascending: true });

  ensureNoError(error, "Failed to load trackers.");
  return (data || []).map(mapTrackerRow);
}

async function connectTracker({ provider, username, token }, userId) {
  const payload = {
    user_id: userId,
    provider: String(provider || "").toLowerCase().trim(),
    connected: true,
    username: username || null,
    token: token || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await getSupabaseClient()
    .from("trackers")
    .upsert(payload, { onConflict: "user_id,provider" });

  ensureNoError(error, "Failed to connect tracker.");
}

async function disconnectTracker(provider, userId) {
  const payload = {
    user_id: userId,
    provider: String(provider || "").toLowerCase().trim(),
    connected: false,
    username: null,
    token: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await getSupabaseClient()
    .from("trackers")
    .upsert(payload, { onConflict: "user_id,provider" });

  ensureNoError(error, "Failed to disconnect tracker.");
}

module.exports = {
  initDb,
  saveProgress,
  getContinueWatching,
  getAnimeHistory,
  getRecentHistory,
  getResume,
  addFavorite,
  removeFavorite,
  isFavorite,
  listFavorites,
  getSettings,
  updateSettings,
  listTrackers,
  connectTracker,
  disconnectTracker,
};
