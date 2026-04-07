const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "memo.db");
const db = new Database(DB_PATH);
const LOCAL_USER_ID = "local-default";

function hasColumn(tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
}

function migrateWatchHistory() {
  const hasProvider = hasColumn("watch_history", "provider");
  const hasCompleted = hasColumn("watch_history", "completed");

  if (hasProvider && hasCompleted) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_history_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anime_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'anilist',
      episode_id TEXT NOT NULL,
      source TEXT,
      position REAL NOT NULL DEFAULT 0,
      duration REAL NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      anime_title TEXT,
      anime_cover TEXT,
      episode_number INTEGER,
      episode_title TEXT,
      updated_at INTEGER NOT NULL,
      UNIQUE(anime_id, provider, episode_id, source)
    );

    INSERT OR IGNORE INTO watch_history_v2 (
      id,
      anime_id,
      provider,
      episode_id,
      source,
      position,
      duration,
      completed,
      anime_title,
      anime_cover,
      episode_number,
      episode_title,
      updated_at
    )
    SELECT
      id,
      anime_id,
      'anilist',
      episode_id,
      source,
      position,
      duration,
      0,
      anime_title,
      anime_cover,
      episode_number,
      episode_title,
      updated_at
    FROM watch_history;

    DROP TABLE watch_history;
    ALTER TABLE watch_history_v2 RENAME TO watch_history;

    CREATE INDEX IF NOT EXISTS idx_watch_history_updated_at
      ON watch_history(updated_at DESC);
  `);
}

function migrateFavorites() {
  const hasProvider = hasColumn("favorites", "provider");

  if (hasProvider) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS favorites_v2 (
      anime_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'anilist',
      anime_title TEXT,
      anime_cover TEXT,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (anime_id, provider)
    );

    INSERT OR IGNORE INTO favorites_v2 (
      anime_id,
      provider,
      anime_title,
      anime_cover,
      added_at
    )
    SELECT
      anime_id,
      'anilist',
      anime_title,
      anime_cover,
      added_at
    FROM favorites;

    DROP TABLE favorites;
    ALTER TABLE favorites_v2 RENAME TO favorites;

    CREATE INDEX IF NOT EXISTS idx_favorites_added_at
      ON favorites(added_at DESC);
  `);
}

function migrateUserScopedWatchHistory() {
  const hasUserId = hasColumn("watch_history", "user_id");
  if (hasUserId) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_history_v3 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      anime_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'anilist',
      episode_id TEXT NOT NULL,
      source TEXT,
      position REAL NOT NULL DEFAULT 0,
      duration REAL NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      anime_title TEXT,
      anime_cover TEXT,
      episode_number INTEGER,
      episode_title TEXT,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, anime_id, provider, episode_id, source)
    );

    INSERT OR IGNORE INTO watch_history_v3 (
      id,
      user_id,
      anime_id,
      provider,
      episode_id,
      source,
      position,
      duration,
      completed,
      anime_title,
      anime_cover,
      episode_number,
      episode_title,
      updated_at
    )
    SELECT
      id,
      '${LOCAL_USER_ID}',
      anime_id,
      provider,
      episode_id,
      source,
      position,
      duration,
      completed,
      anime_title,
      anime_cover,
      episode_number,
      episode_title,
      updated_at
    FROM watch_history;

    DROP TABLE watch_history;
    ALTER TABLE watch_history_v3 RENAME TO watch_history;

    CREATE INDEX IF NOT EXISTS idx_watch_history_user_updated_at
      ON watch_history(user_id, updated_at DESC);
  `);
}

function migrateUserScopedFavorites() {
  const hasUserId = hasColumn("favorites", "user_id");
  if (hasUserId) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS favorites_v3 (
      user_id TEXT NOT NULL,
      anime_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'anilist',
      anime_title TEXT,
      anime_cover TEXT,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, anime_id, provider)
    );

    INSERT OR IGNORE INTO favorites_v3 (
      user_id,
      anime_id,
      provider,
      anime_title,
      anime_cover,
      added_at
    )
    SELECT
      '${LOCAL_USER_ID}',
      anime_id,
      provider,
      anime_title,
      anime_cover,
      added_at
    FROM favorites;

    DROP TABLE favorites;
    ALTER TABLE favorites_v3 RENAME TO favorites;

    CREATE INDEX IF NOT EXISTS idx_favorites_user_added_at
      ON favorites(user_id, added_at DESC);
  `);
}

function migrateUserScopedSettings() {
  const hasUserId = hasColumn("app_settings", "user_id");
  if (hasUserId) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings_v2 (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );

    INSERT OR IGNORE INTO app_settings_v2 (user_id, key, value)
    SELECT '${LOCAL_USER_ID}', key, value
    FROM app_settings;

    DROP TABLE app_settings;
    ALTER TABLE app_settings_v2 RENAME TO app_settings;
  `);
}

function migrateUserScopedTrackers() {
  const hasUserId = hasColumn("trackers", "user_id");
  if (hasUserId) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS trackers_v2 (
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      connected INTEGER NOT NULL DEFAULT 0,
      username TEXT,
      token TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, provider)
    );

    INSERT OR IGNORE INTO trackers_v2 (
      user_id,
      provider,
      connected,
      username,
      token,
      updated_at
    )
    SELECT
      '${LOCAL_USER_ID}',
      provider,
      connected,
      username,
      token,
      updated_at
    FROM trackers;

    DROP TABLE trackers;
    ALTER TABLE trackers_v2 RENAME TO trackers;
  `);
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      anime_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'anilist',
      episode_id TEXT NOT NULL,
      source TEXT,
      position REAL NOT NULL DEFAULT 0,
      duration REAL NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      anime_title TEXT,
      anime_cover TEXT,
      episode_number INTEGER,
      episode_title TEXT,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, anime_id, provider, episode_id, source)
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id TEXT NOT NULL,
      anime_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'anilist',
      anime_title TEXT,
      anime_cover TEXT,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, anime_id, provider)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );

    CREATE TABLE IF NOT EXISTS trackers (
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      connected INTEGER NOT NULL DEFAULT 0,
      username TEXT,
      token TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, provider)
    );
  `);

  migrateWatchHistory();
  migrateFavorites();
  migrateUserScopedWatchHistory();
  migrateUserScopedFavorites();
  migrateUserScopedSettings();
  migrateUserScopedTrackers();

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_watch_history_user_updated_at
      ON watch_history(user_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_favorites_user_added_at
      ON favorites(user_id, added_at DESC);
  `);

  const seedSetting = db.prepare(`
    INSERT INTO app_settings (user_id, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO NOTHING
  `);
  seedSetting.run(LOCAL_USER_ID, "default_source", "allanime");
  seedSetting.run(LOCAL_USER_ID, "sidebar_compact", "1");
  seedSetting.run(LOCAL_USER_ID, "autoplay_next", "1");
  seedSetting.run(LOCAL_USER_ID, "preferred_sub_lang", "en");
  seedSetting.run(LOCAL_USER_ID, "ui_animations", "1");
}

// Ensure schema exists before preparing statements at module load time.
initDb();

const upsertProgressStmt = db.prepare(`
  INSERT INTO watch_history (
    user_id, anime_id, provider, episode_id, source, position, duration, completed,
    anime_title, anime_cover, episode_number, episode_title, updated_at
  )
  VALUES (
    @user_id, @anime_id, @provider, @episode_id, @source, @position, @duration, @completed,
    @anime_title, @anime_cover, @episode_number, @episode_title, @updated_at
  )
  ON CONFLICT(user_id, anime_id, provider, episode_id, source)
  DO UPDATE SET
    position = excluded.position,
    duration = excluded.duration,
    completed = excluded.completed,
    anime_title = excluded.anime_title,
    anime_cover = excluded.anime_cover,
    episode_number = excluded.episode_number,
    episode_title = excluded.episode_title,
    updated_at = excluded.updated_at
`);

const upsertFavoriteStmt = db.prepare(`
  INSERT INTO favorites (user_id, anime_id, provider, anime_title, anime_cover, added_at)
  VALUES (@user_id, @anime_id, @provider, @anime_title, @anime_cover, @added_at)
  ON CONFLICT(user_id, anime_id, provider)
  DO UPDATE SET
    anime_title = excluded.anime_title,
    anime_cover = excluded.anime_cover,
    added_at = excluded.added_at
`);

const removeFavoriteStmt = db.prepare(`
  DELETE FROM favorites
  WHERE user_id = ? AND anime_id = ? AND provider = ?
`);

const getFavoriteStmt = db.prepare(`
  SELECT
    user_id AS userId,
    anime_id AS animeId,
    provider,
    anime_title AS animeTitle,
    anime_cover AS animeCover,
    added_at AS addedAt
  FROM favorites
  WHERE user_id = ? AND anime_id = ? AND provider = ?
  LIMIT 1
`);

const upsertSettingStmt = db.prepare(`
  INSERT INTO app_settings (user_id, key, value)
  VALUES (@user_id, @key, @value)
  ON CONFLICT(user_id, key)
  DO UPDATE SET value = excluded.value
`);

const getSettingsRowsStmt = db.prepare(`
  SELECT key, value
  FROM app_settings
  WHERE user_id = ?
`);

const getSettingStmt = db.prepare(`
  SELECT value
  FROM app_settings
  WHERE user_id = ? AND key = ?
  LIMIT 1
`);

function normalizeDefaultSource(value) {
  if (value === "mock-hianime") return "allanime";
  return value || "allanime";
}

const upsertTrackerStmt = db.prepare(`
  INSERT INTO trackers (user_id, provider, connected, username, token, updated_at)
  VALUES (@user_id, @provider, @connected, @username, @token, @updated_at)
  ON CONFLICT(user_id, provider)
  DO UPDATE SET
    connected = excluded.connected,
    username = excluded.username,
    token = excluded.token,
    updated_at = excluded.updated_at
`);

const clearTrackerStmt = db.prepare(`
  INSERT INTO trackers (user_id, provider, connected, username, token, updated_at)
  VALUES (@user_id, @provider, 0, NULL, NULL, @updated_at)
  ON CONFLICT(user_id, provider)
  DO UPDATE SET
    connected = 0,
    username = NULL,
    token = NULL,
    updated_at = excluded.updated_at
`);

function saveProgress(input, userId = LOCAL_USER_ID) {
  const completed = Boolean(input.completed);
  const duration = Number(input.duration || 0);
  const position = completed ? duration : Number(input.position || 0);

  upsertProgressStmt.run({
    user_id: userId,
    anime_id: input.animeId,
    provider: input.provider || "anilist",
    episode_id: input.episodeId,
    source: input.source || "default",
    position,
    duration,
    completed: completed ? 1 : 0,
    anime_title: input.animeTitle || null,
    anime_cover: input.animeCover || null,
    episode_number: Number.isFinite(input.episodeNumber) ? input.episodeNumber : null,
    episode_title: input.episodeTitle || null,
    updated_at: Date.now(),
  });
}

function getContinueWatching(userId = LOCAL_USER_ID, limit = 24) {
  const rows = db
    .prepare(
      `
      SELECT
        user_id AS userId,
        anime_id AS animeId,
        provider,
        episode_id AS episodeId,
        source,
        position,
        duration,
        completed,
        anime_title AS animeTitle,
        anime_cover AS animeCover,
        episode_number AS episodeNumber,
        episode_title AS episodeTitle,
        updated_at AS updatedAt
      FROM watch_history
      WHERE user_id = ?
        AND position > 0
        AND completed = 0
        AND (duration <= 0 OR position < duration * 0.95)
      ORDER BY updated_at DESC
      LIMIT ?
    `,
    )
    .all(userId, Math.max(1, Math.min(100, Number(limit) || 24)));

  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    const key = `${row.provider}:${row.animeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

function getAnimeHistory(userId = LOCAL_USER_ID, animeId, provider = "anilist") {
  return db
    .prepare(
      `
      SELECT
        user_id AS userId,
        anime_id AS animeId,
        provider,
        episode_id AS episodeId,
        source,
        position,
        duration,
        completed,
        anime_title AS animeTitle,
        anime_cover AS animeCover,
        episode_number AS episodeNumber,
        episode_title AS episodeTitle,
        updated_at AS updatedAt
      FROM watch_history
      WHERE user_id = ? AND anime_id = ? AND provider = ?
      ORDER BY episode_number ASC, updated_at DESC
    `,
    )
    .all(userId, animeId, provider);
}

function getRecentHistory(userId = LOCAL_USER_ID, limit = 60) {
  return db
    .prepare(
      `
      SELECT
        user_id AS userId,
        anime_id AS animeId,
        provider,
        episode_id AS episodeId,
        source,
        position,
        duration,
        completed,
        anime_title AS animeTitle,
        anime_cover AS animeCover,
        episode_number AS episodeNumber,
        episode_title AS episodeTitle,
        updated_at AS updatedAt
      FROM watch_history
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `,
    )
    .all(userId, Math.max(1, Math.min(200, Number(limit) || 60)));
}

function getResume(userId = LOCAL_USER_ID, animeId, episodeId, source = "default", provider = "anilist") {
  const exactSource =
    source && source !== "default"
      ? db
          .prepare(
            `
            SELECT
              anime_id AS animeId,
              provider,
              episode_id AS episodeId,
              source,
              position,
              duration,
              completed,
              anime_title AS animeTitle,
              anime_cover AS animeCover,
              episode_number AS episodeNumber,
              episode_title AS episodeTitle,
            updated_at AS updatedAt
            FROM watch_history
            WHERE user_id = ? AND anime_id = ? AND provider = ? AND episode_id = ? AND source = ?
            LIMIT 1
          `,
          )
          .get(userId, animeId, provider, episodeId, source)
      : null;

  const latestAnySource =
    db
      .prepare(
        `
        SELECT
          anime_id AS animeId,
          provider,
          episode_id AS episodeId,
          source,
          position,
          duration,
          completed,
          anime_title AS animeTitle,
          anime_cover AS animeCover,
          episode_number AS episodeNumber,
          episode_title AS episodeTitle,
          updated_at AS updatedAt
        FROM watch_history
        WHERE user_id = ? AND anime_id = ? AND provider = ? AND episode_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      )
      .get(userId, animeId, provider, episodeId) || null;

  const item = exactSource || latestAnySource;

  if (!item || item.completed) return null;
  if (Number(item.duration || 0) > 0 && Number(item.position || 0) >= Number(item.duration || 0) * 0.95) {
    return null;
  }
  return item;
}

function addFavorite(input, userId = LOCAL_USER_ID) {
  upsertFavoriteStmt.run({
    user_id: userId,
    anime_id: input.animeId,
    provider: input.provider || "anilist",
    anime_title: input.animeTitle || null,
    anime_cover: input.animeCover || null,
    added_at: Date.now(),
  });
}

function removeFavorite(animeId, provider = "anilist", userId = LOCAL_USER_ID) {
  removeFavoriteStmt.run(userId, animeId, provider);
}

function isFavorite(animeId, provider = "anilist", userId = LOCAL_USER_ID) {
  return Boolean(getFavoriteStmt.get(userId, animeId, provider));
}

function listFavorites(userId = LOCAL_USER_ID, limit = 100) {
  return db
    .prepare(
      `
      SELECT
        user_id AS userId,
        anime_id AS animeId,
        provider,
        anime_title AS animeTitle,
        anime_cover AS animeCover,
        added_at AS addedAt
      FROM favorites
      WHERE user_id = ?
      ORDER BY added_at DESC
      LIMIT ?
    `,
    )
    .all(userId, Math.max(1, Math.min(500, Number(limit) || 100)));
}

function ensureSeedSettings(userId = LOCAL_USER_ID) {
  const seedSetting = db.prepare(`
    INSERT INTO app_settings (user_id, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO NOTHING
  `);
  seedSetting.run(userId, "default_source", "allanime");
  seedSetting.run(userId, "sidebar_compact", "1");
  seedSetting.run(userId, "autoplay_next", "1");
  seedSetting.run(userId, "preferred_sub_lang", "en");
  seedSetting.run(userId, "ui_animations", "1");
}

function getSettings(userId = LOCAL_USER_ID) {
  ensureSeedSettings(userId);
  const rows = getSettingsRowsStmt.all(userId);
  const map = new Map(rows.map((row) => [row.key, row.value]));

  return {
    defaultSource: normalizeDefaultSource(map.get("default_source")),
    sidebarCompact: (map.get("sidebar_compact") || "1") === "1",
    autoplayNext: (map.get("autoplay_next") || "1") === "1",
    preferredSubLang: map.get("preferred_sub_lang") || "en",
    uiAnimations: (map.get("ui_animations") || "1") === "1",
  };
}

function updateSettings(input, userId = LOCAL_USER_ID) {
  ensureSeedSettings(userId);
  if (typeof input.defaultSource === "string") {
    upsertSettingStmt.run({
      user_id: userId,
      key: "default_source",
      value: normalizeDefaultSource(input.defaultSource),
    });
  }
  if (typeof input.sidebarCompact === "boolean") {
    upsertSettingStmt.run({ user_id: userId, key: "sidebar_compact", value: input.sidebarCompact ? "1" : "0" });
  }
  if (typeof input.autoplayNext === "boolean") {
    upsertSettingStmt.run({ user_id: userId, key: "autoplay_next", value: input.autoplayNext ? "1" : "0" });
  }
  if (typeof input.preferredSubLang === "string") {
    upsertSettingStmt.run({ user_id: userId, key: "preferred_sub_lang", value: input.preferredSubLang });
  }
  if (typeof input.uiAnimations === "boolean") {
    upsertSettingStmt.run({ user_id: userId, key: "ui_animations", value: input.uiAnimations ? "1" : "0" });
  }
}

function getDefaultSource(userId = LOCAL_USER_ID) {
  ensureSeedSettings(userId);
  const row = getSettingStmt.get(userId, "default_source");
  return normalizeDefaultSource(row?.value);
}

function listTrackers(userId = LOCAL_USER_ID) {
  return db
    .prepare(
      `
      SELECT
        provider,
        connected,
        username,
        updated_at AS updatedAt
      FROM trackers
      WHERE user_id = ?
      ORDER BY provider ASC
    `,
    )
    .all(userId)
    .map((row) => ({
      provider: row.provider,
      connected: Boolean(row.connected),
      username: row.username || null,
      updatedAt: row.updatedAt,
    }));
}

function connectTracker({ provider, username, token }, userId = LOCAL_USER_ID) {
  upsertTrackerStmt.run({
    user_id: userId,
    provider: String(provider || "").toLowerCase().trim(),
    connected: 1,
    username: username || null,
    token: token || null,
    updated_at: Date.now(),
  });
}

function disconnectTracker(provider, userId = LOCAL_USER_ID) {
  clearTrackerStmt.run({
    user_id: userId,
    provider: String(provider || "").toLowerCase().trim(),
    updated_at: Date.now(),
  });
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
  getDefaultSource,
  listTrackers,
  connectTracker,
  disconnectTracker,
};
