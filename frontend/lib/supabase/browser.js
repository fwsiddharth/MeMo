"use client";

import { createBrowserClient } from "@supabase/ssr";

let browserClient = null;

export function getBrowserSupabaseClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase browser env is missing.");
  }

  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
