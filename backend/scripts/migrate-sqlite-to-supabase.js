const path = require("path");
const Database = require("better-sqlite3");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const SQLITE_PATH = path.join(__dirname, "..", "memo.db");

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

async function getFallbackUserId(client) {
  const explicit = String(process.env.MIGRATION_USER_ID || "").trim();
  if (explicit) return explicit;

  const { data, error } = await client.auth.admin.listUsers({ perPage: 1 });
  if (error) {
    throw error;
  }

  const userId = data?.users?.[0]?.id;
  if (!userId) {
    throw new Error(
      "No auth.users row was found to receive migrated rows without user_id. Set MIGRATION_USER_ID to a real Supabase auth user id.",
    );
  }

  return userId;
}

async function main() {
  const client = getSupabaseClient();
  const db = new Database(SQLITE_PATH, { readonly: true });
  const fallbackUserId = await getFallbackUserId(client);

  if (tableExists(db, "history") || tableExists(db, "watch_history")) {
    const tableName = tableExists(db, "history") ? "history" : "watch_history";
    const hasUserId = hasColumn(db, tableName, "user_id");
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
    const mapped = rows.map((row) => ({
      user_id: row.user_id || fallbackUserId,
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
      updated_at: row.updated_at || new Date().toISOString(),
    }));
    if (mapped.length) {
      await upsertAll(client, "history", mapped, "user_id,anime_id,episode_id");
    }
    console.log(`migrated ${tableName}: ${mapped.length} rows${hasUserId ? "" : " (assigned to fallback auth user)"}`);
  }

  if (tableExists(db, "favorites")) {
    const rows = db.prepare("SELECT * FROM favorites").all();
    const mapped = rows.map((row) => ({
      user_id: row.user_id || fallbackUserId,
      anime_id: row.anime_id,
      provider: row.provider || "anilist",
      anime_title: row.anime_title || null,
      anime_cover: row.anime_cover || null,
      created_at: row.created_at || row.added_at || new Date().toISOString(),
    }));
    if (mapped.length) {
      await upsertAll(client, "favorites", mapped, "user_id,anime_id,provider");
    }
    console.log(`migrated favorites: ${mapped.length} rows`);
  }

  if (tableExists(db, "user_settings") || tableExists(db, "app_settings")) {
    const tableName = tableExists(db, "user_settings") ? "user_settings" : "app_settings";
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
    const byUser = new Map();

    for (const row of rows) {
      const userId = row.user_id || fallbackUserId;
      const current = byUser.get(userId) || {
        sidebarCompact: true,
        autoplayNext: true,
        preferredSubLang: "en",
        uiAnimations: true,
      };

      if (tableName === "user_settings" && row.settings && typeof row.settings === "object") {
        byUser.set(userId, { ...current, ...row.settings });
        continue;
      }

      switch (String(row.key || "").trim()) {
        case "sidebar_compact":
          current.sidebarCompact = row.value === "1";
          break;
        case "autoplay_next":
          current.autoplayNext = row.value === "1";
          break;
        case "preferred_sub_lang":
          current.preferredSubLang = String(row.value || "en");
          break;
        case "ui_animations":
          current.uiAnimations = row.value === "1";
          break;
        default:
          break;
      }

      byUser.set(userId, current);
    }

    const mapped = Array.from(byUser.entries()).map(([user_id, settings]) => ({
      user_id,
      settings,
      updated_at: new Date().toISOString(),
    }));

    if (mapped.length) {
      await upsertAll(client, "user_settings", mapped, "user_id");
    }
    console.log(`migrated ${tableName}: ${mapped.length} rows`);
  }

  if (tableExists(db, "trackers")) {
    const rows = db.prepare("SELECT * FROM trackers").all();
    const mapped = rows.map((row) => ({
      user_id: row.user_id || fallbackUserId,
      provider: row.provider,
      connected: Boolean(row.connected),
      username: row.username || null,
      token: row.token || null,
      updated_at: row.updated_at || new Date().toISOString(),
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
