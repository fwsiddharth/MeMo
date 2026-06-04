"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getApiBase } from "../lib/api";

const AppStatusContext = createContext({
  backendStatus: "checking",
  routePending: false,
  routeLabel: "",
});

function buildRouteSignature(pathname, searchParams) {
  return `${pathname || "/"}?${searchParams?.toString() || ""}`;
}

export default function AppStatusProvider({ children }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [backendStatus, setBackendStatus] = useState("checking");
  const [routePending, setRoutePending] = useState(false);
  const [routeLabel, setRouteLabel] = useState("");
  const backendStatusRef = useRef(backendStatus);
  const routeTimeoutRef = useRef(null);

  const routeSignature = buildRouteSignature(pathname, searchParams);

  useEffect(() => {
    backendStatusRef.current = backendStatus;
  }, [backendStatus]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId = null;

    const pingBackend = async ({ revealChecking = false } = {}) => {
      if (cancelled) return;

      if (revealChecking) {
        setBackendStatus("checking");
      }

      const controller = new AbortController();
      timeoutId = window.setTimeout(() => controller.abort(), 7000);

      try {
        const response = await fetch(`${getApiBase()}/api/health`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        if (!cancelled) {
          setBackendStatus("online");
        }
      } catch {
        if (!cancelled) {
          setBackendStatus("offline");
        }
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
      }
    };

    pingBackend({ revealChecking: true });

    const interval = window.setInterval(() => {
      pingBackend({ revealChecking: backendStatusRef.current !== "online" });
    }, 15000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        pingBackend({ revealChecking: backendStatusRef.current !== "online" });
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (routeTimeoutRef.current) {
      window.clearTimeout(routeTimeoutRef.current);
      routeTimeoutRef.current = null;
    }
    setRoutePending(false);
    setRouteLabel("");
  }, [routeSignature]);

  useEffect(() => {
    const handleClick = (event) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target?.closest?.("a[href]");
      if (!target) return;
      if (target.hasAttribute("download")) return;
      if (target.getAttribute("target") === "_blank") return;

      const href = target.getAttribute("href") || "";
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      let url = null;
      try {
        url = new URL(target.href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (url.pathname === pathname && url.search === `?${searchParams?.toString() || ""}`) return;

      const label =
        target.getAttribute("aria-label") ||
        target.getAttribute("title") ||
        target.textContent?.trim().replace(/\s+/g, " ").slice(0, 48) ||
        "Loading";

      if (routeTimeoutRef.current) {
        window.clearTimeout(routeTimeoutRef.current);
      }
      setRoutePending(true);
      setRouteLabel(label);
      routeTimeoutRef.current = window.setTimeout(() => {
        setRoutePending(false);
        setRouteLabel("");
      }, 60000);
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      if (routeTimeoutRef.current) {
        window.clearTimeout(routeTimeoutRef.current);
        routeTimeoutRef.current = null;
      }
    };
  }, [pathname, searchParams]);

  const value = useMemo(
    () => ({
      backendStatus,
      routePending,
      routeLabel,
      setRoutePending,
    }),
    [backendStatus, routeLabel, routePending],
  );

  return <AppStatusContext.Provider value={value}>{children}</AppStatusContext.Provider>;
}

export function useAppStatus() {
  return useContext(AppStatusContext);
}
