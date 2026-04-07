export function getApiBase() {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
  }
  return process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
}

export async function apiFetch(path, options = {}) {
  let authHeader = {};

  if (typeof window !== "undefined" && !(options.headers && "Authorization" in options.headers)) {
    try {
      const { getBrowserSupabaseClient } = await import("./supabase/browser");
      const {
        data: { session },
      } = await getBrowserSupabaseClient().auth.getSession();

      if (session?.access_token) {
        authHeader = {
          Authorization: `Bearer ${session.access_token}`,
        };
      }
    } catch {
      // No browser session yet.
    }
  }

  const response = await fetch(`${getApiBase()}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }

  return body;
}

export function stripHtml(input = "") {
  return String(input).replace(/<[^>]*>/g, "");
}
