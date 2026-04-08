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

      <main className="flex-1 px-4 pb-4 pt-5 md:px-6 md:pb-6 md:pt-6 xl:px-8">
        {children}
      </main>
    </div>
  );
}
