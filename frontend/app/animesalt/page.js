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
        <h1 className="text-2xl font-semibold tracking-tight">AnimeSalt</h1>
        <p className="rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>
      </div>
    );
  }

  return <AnimeSaltHubClient discover={discover} />;
}
