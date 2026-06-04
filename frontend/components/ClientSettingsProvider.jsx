"use client";

import { createContext, startTransition, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

const defaultSettings = {
  autoplayNext: true,
  sidebarCompact: true,
  preferredSubLang: "en",
  uiAnimations: true,
  themeMode: "system",
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
  window.localStorage.setItem("memo_theme_mode", settings.themeMode || "system");
}

function readLocalSettings() {
  if (typeof window === "undefined") return {};

  const sidebarCompact = window.localStorage.getItem("memo_sidebar_compact");
  const uiAnimations = window.localStorage.getItem("memo_ui_animations");
  const autoplayNext = window.localStorage.getItem("memo_autoplay_next");
  const preferredSubLang = window.localStorage.getItem("memo_preferred_sub_lang");
  const themeMode = window.localStorage.getItem("memo_theme_mode");

  return {
    ...(sidebarCompact === null ? {} : { sidebarCompact: sidebarCompact === "1" }),
    ...(uiAnimations === null ? {} : { uiAnimations: uiAnimations === "1" }),
    ...(autoplayNext === null ? {} : { autoplayNext: autoplayNext === "1" }),
    ...(preferredSubLang ? { preferredSubLang } : {}),
    ...(themeMode ? { themeMode } : {}),
  };
}

function resolveTheme(themeMode) {
  if (themeMode === "light" || themeMode === "dark") return themeMode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
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
    if (typeof document === "undefined") return undefined;

    const applyTheme = () => {
      const theme = resolveTheme(settings.themeMode);
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    };

    applyTheme();

    if (settings.themeMode !== "system") return undefined;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyTheme();
    media.addEventListener?.("change", listener);
    return () => {
      media.removeEventListener?.("change", listener);
    };
  }, [settings.themeMode]);

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
