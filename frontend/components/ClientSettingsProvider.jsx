"use client";

import { createContext, startTransition, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

const defaultSettings = {
  autoplayNext: true,
  sidebarCompact: true,
  preferredSubLang: "en",
  uiAnimations: true,
};

const ClientSettingsContext = createContext({
  settings: defaultSettings,
  loaded: false,
  setSettings: () => {},
  refreshSettings: async () => ({ settings: defaultSettings }),
});

function persistSettings(settings) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem("memo_sidebar_compact", settings.sidebarCompact ? "1" : "0");
  window.localStorage.setItem("memo_ui_animations", settings.uiAnimations ? "1" : "0");
  window.localStorage.setItem("memo_autoplay_next", settings.autoplayNext ? "1" : "0");
  window.localStorage.setItem("memo_preferred_sub_lang", settings.preferredSubLang || "en");
}

function readLocalSettings() {
  if (typeof window === "undefined") return {};

  const sidebarCompact = window.localStorage.getItem("memo_sidebar_compact");
  const uiAnimations = window.localStorage.getItem("memo_ui_animations");
  const autoplayNext = window.localStorage.getItem("memo_autoplay_next");
  const preferredSubLang = window.localStorage.getItem("memo_preferred_sub_lang");

  return {
    ...(sidebarCompact === null ? {} : { sidebarCompact: sidebarCompact === "1" }),
    ...(uiAnimations === null ? {} : { uiAnimations: uiAnimations === "1" }),
    ...(autoplayNext === null ? {} : { autoplayNext: autoplayNext === "1" }),
    ...(preferredSubLang ? { preferredSubLang } : {}),
  };
}

export default function ClientSettingsProvider({ children }) {
  const [settings, setSettingsState] = useState(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  const setSettings = (nextValue) => {
    startTransition(() => {
      setSettingsState((current) => {
        const next =
          typeof nextValue === "function"
            ? nextValue(current)
            : { ...current, ...(nextValue || {}) };

        persistSettings(next);
        return next;
      });
    });
  };

  const refreshSettings = async () => {
    const response = await apiFetch("/api/settings");
    const nextSettings = { ...defaultSettings, ...(response.settings || {}) };
    setSettings(nextSettings);
    setLoaded(true);
    return response;
  };

  useEffect(() => {
    const localSettings = readLocalSettings();
    if (Object.keys(localSettings).length) {
      setSettingsState((current) => ({ ...current, ...localSettings }));
    }
  }, []);

  useEffect(() => {
    refreshSettings().catch(() => {
      setLoaded(true);
    });
  }, []);

  const value = useMemo(
    () => ({
      settings,
      loaded,
      setSettings,
      refreshSettings,
    }),
    [loaded, settings],
  );

  return (
    <ClientSettingsContext.Provider value={value}>{children}</ClientSettingsContext.Provider>
  );
}

export function useClientSettings() {
  return useContext(ClientSettingsContext);
}
