const path = require("path");
const Database = require("better-sqlite3");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const SQLITE_PATH = path.join(__dirname, "..", "memo.db");
const FALLBACK_USER_ID = "local-default";

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function tableExists(db, tableName) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1")
    .get(tableName);
  return Boolean(row?.name);
}

function hasColumn(db, tableName, columnName) {
  if (!tableExists(db, tableName)) return false;
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
}

function sourceValue(value) {
  return value == null || value === "" ? null : value;
}

function splitBatches(list, size = 500) {
  const chunks = [];
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size));
  }
  return chunks;
}

async function upsertAll(client, table, rows, onConflict) {
  for (const chunk of splitBatches(rows)) {
    const { error } = await client.from(table).upsert(chunk, { onConflict });
    if (error) {
      throw error;
    }
  }
}

async function main() {
  const client = getSupabaseClient();
  const db = new Database(SQLITE_PATH, { readonly: true });

  if (tableExists(db, "watch_history")) {
    const hasUserId = hasColumn(db, "watch_history", "user_id");
    const rows = db.prepare("SELECT * FROM watch_history").all();
    const mapped = rows.map((row) => ({
      user_id: row.user_id || FALLBACK_USER_ID,
      anime_id: row.anime_id,
      provider: row.provider || "anilist",
      episode_id: row.episode_id,
      source: sourceValue(row.source),
      position: Number(row.position || 0),
      duration: Number(row.duration || 0),
      completed: Boolean(row.completed),
      anime_title: row.anime_title || null,
      anime_cover: row.anime_cover || null,
      episode_number: Number.isFinite(Number(row.episode_number)) ? Number(row.episode_number) : null,
      episode_title: row.episode_title || null,
      updated_at: Number(row.updated_at || Date.now()),
    }));
    if (mapped.length) {
      await upsertAll(client, "watch_history", mapped, "user_id,anime_id,provider,episode_id,source");
    }
    console.log(`migrated watch_history: ${mapped.length} rows${hasUserId ? "" : " (assigned to local-default)"}`);
  }

  if (tableExists(db, "favorites")) {
    const rows = db.prepare("SELECT * FROM favorites").all();
    const mapped = rows.map((row) => ({
      user_id: row.user_id || FALLBACK_USER_ID,
      anime_id: row.anime_id,
      provider: row.provider || "anilist",
      anime_title: row.anime_title || null,
      anime_cover: row.anime_cover || null,
      added_at: Number(row.added_at || Date.now()),
    }));
    if (mapped.length) {
      await upsertAll(client, "favorites", mapped, "user_id,anime_id,provider");
    }
    console.log(`migrated favorites: ${mapped.length} rows`);
  }

  if (tableExists(db, "app_settings")) {
    const rows = db.prepare("SELECT * FROM app_settings").all();
    const mapped = rows.map((row) => ({
      user_id: row.user_id || FALLBACK_USER_ID,
      key: row.key,
      value: String(row.value ?? ""),
    }));
    if (mapped.length) {
      await upsertAll(client, "app_settings", mapped, "user_id,key");
    }
    console.log(`migrated app_settings: ${mapped.length} rows`);
  }

  if (tableExists(db, "trackers")) {
    const rows = db.prepare("SELECT * FROM trackers").all();
    const mapped = rows.map((row) => ({
      user_id: row.user_id || FALLBACK_USER_ID,
      provider: row.provider,
      connected: Boolean(row.connected),
      username: row.username || null,
      token: row.token || null,
      updated_at: Number(row.updated_at || Date.now()),
    }));
    if (mapped.length) {
      await upsertAll(client, "trackers", mapped, "user_id,provider");
    }
    console.log(`migrated trackers: ${mapped.length} rows`);
  }

  console.log("sqlite to supabase migration complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
