import AnimeSaltHubClient from "../../components/AnimeSaltHubClient";
import { apiFetch } from "../../lib/api";
import { requireServerSession } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AnimeSaltPage() {
  const session = await requireServerSession();
  const authHeaders = {
    Authorization: `Bearer ${session.access_token}`,
  };

  let discover = {
    filters: { languages: [], platforms: [] },
    sections: [],
  };
  let error = "";

  try {
    discover = await apiFetch("/api/discover/animesalt", {
      headers: authHeaders,
    });
  } catch (err) {
    error = err.message || "Failed to load AnimeSalt hub.";
  }

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="app-mono text-2xl font-medium tracking-[-0.03em] text-zinc-950">AnimeSalt</h1>
        <p className="rounded-[6px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      </div>
    );
  }

  return <AnimeSaltHubClient discover={discover} />;
}
