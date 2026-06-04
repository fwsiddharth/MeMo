"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Layers3, Search, UserCircle2, WifiOff } from "lucide-react";
import { useAppStatus } from "./AppStatusProvider";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Search" },
  { href: "/library", label: "Library" },
];

function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavShell({ children }) {
  const pathname = usePathname();
  const { backendStatus, routePending, routeLabel } = useAppStatus();

  if (pathname === "/login") {
    return <div className="min-h-screen overflow-x-clip bg-zinc-950 text-zinc-100">{children}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-50 px-4 pt-4 md:px-6 xl:px-8">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between rounded-full border border-white/10 bg-zinc-950/78 px-4 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl md:px-5">
          <Link href="/" className="text-xl font-semibold tracking-tight text-white md:text-2xl">
            MeMo
          </Link>

          <div className="flex items-center gap-1.5 md:gap-2">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-3 py-2 text-sm transition md:px-4 ${
                    active
                      ? "bg-cyan-300 text-zinc-900"
                      : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            <Link
              href="/search"
              className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition hover:bg-zinc-800 hover:text-white md:hidden"
              aria-label="Search"
              title="Search"
            >
              <Search size={18} />
            </Link>

            <Link
              href="/animesalt"
              className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                isActive(pathname, "/animesalt")
                  ? "bg-cyan-300 text-zinc-900"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
              aria-label="Open AnimeSalt hub"
              title="AnimeSalt"
            >
              <Layers3 size={18} />
            </Link>

            <Link
              href="/settings"
              className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                isActive(pathname, "/settings")
                  ? "bg-cyan-300 text-zinc-900"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
              aria-label="Open settings"
              title="Settings"
            >
              <UserCircle2 size={20} />
            </Link>
          </div>
        </div>
      </header>

      <div className="pointer-events-none sticky top-[4.5rem] z-40 px-4 md:px-6 xl:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
          {backendStatus !== "online" ? (
            <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-2 text-sm text-amber-100 shadow-[0_12px_40px_rgba(0,0,0,0.25)] backdrop-blur-xl">
              <WifiOff size={16} className="shrink-0 text-amber-300" />
              <div className="min-w-0">
                <p className="font-medium">
                  {backendStatus === "checking" ? "Reconnecting to backend..." : "Backend is sleeping."}
                </p>
                <p className="text-xs text-amber-100/75">
                  {backendStatus === "checking"
                    ? "Loading again. Your data will come back once Render wakes up."
                    : "The free backend is offline right now and will wake on the next request."}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-amber-200">
                <span className="h-2 w-2 rounded-full bg-amber-300 animate-pulse" />
                {backendStatus === "checking" ? "Loading" : "Offline"}
              </div>
            </div>
          ) : null}

          {routePending ? (
            <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100 shadow-[0_12px_40px_rgba(0,0,0,0.22)] backdrop-blur-xl">
              <Loader2 size={16} className="shrink-0 animate-spin text-cyan-300" />
              <div className="min-w-0">
                <p className="font-medium">Opening {routeLabel || "page"}...</p>
                <p className="text-xs text-cyan-100/75">
                  Hang tight while the next view loads.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <main className="flex-1 px-4 pb-4 pt-5 md:px-6 md:pb-6 md:pt-6 xl:px-8">
        {children}
      </main>
    </div>
  );
}
