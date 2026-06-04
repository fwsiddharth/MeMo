"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers3, Search, UserCircle2 } from "lucide-react";

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

  if (pathname === "/login") {
    return <div className="min-h-screen overflow-x-clip bg-[var(--background)] text-[var(--text-primary)]">{children}</div>;
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-[var(--background)] text-[var(--text-primary)]">
      <div className="app-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />

      <header className="sticky top-0 z-50 px-4 pt-4 md:px-6 xl:px-8">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between rounded-[6px] border border-zinc-200/80 bg-white/90 px-4 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.04)] backdrop-blur-xl md:px-5">
          <Link href="/" className="app-mono text-lg font-medium tracking-[-0.04em] text-zinc-900 md:text-xl">
            MeMo
          </Link>

          <div className="flex items-center gap-1.5 md:gap-2">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-[6px] px-3 py-2 text-sm transition md:px-4 ${
                    active
                      ? "bg-zinc-900 text-white shadow-sm"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            <Link
              href="/search"
              className="flex h-10 w-10 items-center justify-center rounded-[6px] text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 md:hidden"
              aria-label="Search"
              title="Search"
            >
              <Search size={18} />
            </Link>

            <Link
              href="/animesalt"
              className={`flex h-10 w-10 items-center justify-center rounded-[6px] transition ${
                isActive(pathname, "/animesalt")
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
              aria-label="Open AnimeSalt hub"
              title="AnimeSalt"
            >
              <Layers3 size={18} />
            </Link>

            <Link
              href="/settings"
              className={`flex h-10 w-10 items-center justify-center rounded-[6px] transition ${
                isActive(pathname, "/settings")
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
              aria-label="Open settings"
              title="Settings"
            >
              <UserCircle2 size={20} />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 px-4 pb-8 pt-5 md:px-6 md:pb-10 md:pt-6 xl:px-8">
        <div className="mx-auto w-full max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}
