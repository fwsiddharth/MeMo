"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2, Link2, Database, Sparkles, SunMedium, Moon, Monitor } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useClientSettings } from "../../components/ClientSettingsProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { getBrowserSupabaseClient } from "../../lib/supabase/browser";

export default function SettingsPage() {
  const router = useRouter();
  const { settings: clientSettings, setSettings: setClientSettings } = useClientSettings();
  const [settings, setSettings] = useState({
    autoplayNext: true,
    sidebarCompact: true,
    preferredSubLang: "en",
    uiAnimations: true,
    themeMode: "system",
  });
  const [trackers, setTrackers] = useState([]);
  const [trackerDraft, setTrackerDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [authReady, setAuthReady] = useState(false);

  const updateDraftSettings = (patch) => {
    setSettings((current) => ({ ...current, ...patch }));
    setClientSettings((current) => ({ ...current, ...patch }));
  };

  const load = async () => {
    const [settingsRes, trackersRes] = await Promise.all([
      apiFetch("/api/settings"),
      apiFetch("/api/trackers"),
    ]);
    const nextSettings = {
      autoplayNext: true,
      sidebarCompact: true,
      preferredSubLang: "en",
      uiAnimations: true,
      themeMode: "system",
      ...(settingsRes.settings || {}),
    };
    setSettings(nextSettings);
    setClientSettings(nextSettings);
    setTrackers(trackersRes.items || []);
  };

  useEffect(() => {
    let active = true;
    const supabase = getBrowserSupabaseClient();

    const bootstrap = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!active) return;
        setUserEmail(data?.user?.email || "");
        setAuthReady(Boolean(data?.user));
      } catch (err) {
        if (!active) return;
        setMessage(err.message || "Failed to restore session.");
        setAuthReady(false);
      }
    };

    bootstrap();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUserEmail(session?.user?.email || "");
      setAuthReady(Boolean(session?.user));
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setSettings(clientSettings);
  }, [clientSettings]);

  useEffect(() => {
    if (!authReady) return;

    load().catch((err) => setMessage(err.message || "Failed to load settings."));
  }, [authReady]);

  const saveSettings = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      const nextSettings = res.settings || settings;
      setSettings(nextSettings);
      setClientSettings(nextSettings);
      setMessage("Settings saved.");
    } catch (err) {
      setMessage(err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const connectTracker = async (provider) => {
    try {
      const payload = trackerDraft[provider] || {};
      const res = await apiFetch("/api/trackers/connect", {
        method: "POST",
        body: JSON.stringify({
          provider,
          username: payload.username || "",
          token: payload.token || "",
        }),
      });
      setTrackers(res.items || []);
      setMessage(`${provider} connected.`);
    } catch (err) {
      setMessage(err.message || "Tracker connect failed.");
    }
  };

  const disconnectTracker = async (provider) => {
    try {
      const res = await apiFetch(`/api/trackers/${encodeURIComponent(provider)}`, {
        method: "DELETE",
      });
      setTrackers(res.items || []);
      setMessage(`${provider} disconnected.`);
    } catch (err) {
      setMessage(err.message || "Tracker disconnect failed.");
    }
  };

  const trackerProviders = ["anilist", "kitsu", "mal"];

  const signOut = async () => {
    try {
      await getBrowserSupabaseClient().auth.signOut();
      router.replace("/login");
      router.refresh();
    } catch (err) {
      setMessage(err.message || "Failed to sign out.");
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Control Center</p>
        <h1 className="app-mono flex items-center gap-2 text-2xl font-medium tracking-[-0.03em] text-zinc-950 md:text-3xl">
          <Settings2 size={24} />
          Settings
        </h1>
        <p className="text-sm leading-6 text-zinc-500">Manage source, UI behavior, playback defaults, and tracker connections.</p>
      </header>

      {message ? (
        <div className="rounded-[6px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">{message}</div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in with Supabase Auth.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-900">{userEmail || "Signed in"}</p>
            <p className="text-xs text-zinc-500">Your history, favorites, settings, and trackers are now scoped per user.</p>
          </div>
          <Button variant="secondary" onClick={signOut}>
            Sign Out
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database size={16} />
              Source & Playback
            </CardTitle>
            <CardDescription>Configure player behavior.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="space-y-1 text-sm">
              <span className="text-zinc-700">Preferred Subtitle Language</span>
              <Input
                value={settings.preferredSubLang || "en"}
                onChange={(e) => updateDraftSettings({ preferredSubLang: e.target.value })}
                placeholder="en / ja / es..."
              />
            </label>

            <div className="flex items-center justify-between rounded-[6px] border border-zinc-200 px-3 py-2">
              <span className="text-sm text-zinc-700">Autoplay Next Episode</span>
              <Switch
                checked={Boolean(settings.autoplayNext)}
                onCheckedChange={(value) => updateDraftSettings({ autoplayNext: Boolean(value) })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles size={16} />
              Interface
            </CardTitle>
            <CardDescription>Tune UI feel and navigation density.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-700">Theme</span>
                <span className="text-xs text-zinc-500">System default</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "system", label: "System", icon: Monitor },
                  { value: "light", label: "Light", icon: SunMedium },
                  { value: "dark", label: "Dark", icon: Moon },
                ].map((option) => {
                  const Icon = option.icon;
                  const active = (settings.themeMode || "system") === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateDraftSettings({ themeMode: option.value })}
                      className={`flex items-center justify-center gap-2 rounded-[6px] border px-3 py-2 text-sm transition ${
                        active
                          ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
                      }`}
                    >
                      <Icon size={14} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-[6px] border border-zinc-200 px-3 py-2">
              <span className="text-sm text-zinc-700">Compact Sidebar</span>
              <Switch
                checked={Boolean(settings.sidebarCompact)}
                onCheckedChange={(value) => updateDraftSettings({ sidebarCompact: Boolean(value) })}
              />
            </div>
            <div className="flex items-center justify-between rounded-[6px] border border-zinc-200 px-3 py-2">
              <span className="text-sm text-zinc-700">Enable GSAP Scroll Animations</span>
              <Switch
                checked={Boolean(settings.uiAnimations)}
                onCheckedChange={(value) => updateDraftSettings({ uiAnimations: Boolean(value) })}
              />
            </div>

            <Button disabled={saving} onClick={saveSettings}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 size={16} />
            Tracker Connections
          </CardTitle>
          <CardDescription>Store local tracker connection state (personal setup).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {trackerProviders.map((provider) => {
            const current = trackers.find((t) => t.provider === provider);
            return (
              <div key={provider} className="rounded-[6px] border border-zinc-200 p-3">
                <p className="text-sm font-medium uppercase tracking-wide text-zinc-900">{provider}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {current?.connected ? `Connected${current.username ? ` as ${current.username}` : ""}` : "Not connected"}
                </p>
                <div className="mt-3 space-y-2">
                  <Input
                    placeholder="Username"
                    value={trackerDraft[provider]?.username || ""}
                    onChange={(e) =>
                      setTrackerDraft((d) => ({
                        ...d,
                        [provider]: { ...(d[provider] || {}), username: e.target.value },
                      }))
                    }
                  />
                  <Input
                    placeholder="Token (optional)"
                    value={trackerDraft[provider]?.token || ""}
                    onChange={(e) =>
                      setTrackerDraft((d) => ({
                        ...d,
                        [provider]: { ...(d[provider] || {}), token: e.target.value },
                      }))
                    }
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => connectTracker(provider)}>
                      Connect
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => disconnectTracker(provider)}>
                      Disconnect
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
