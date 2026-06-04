"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function isModifiedEvent(event) {
  return Boolean(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
}

function buildRouteSignature(pathname, searchParams) {
  return `${pathname || "/"}?${searchParams?.toString() || ""}`;
}

export default function RoutePendingLink({
  href,
  children,
  className = "",
  variant = "overlay",
  loadingLabel = "Loading",
  spinnerSize = 16,
  onClick,
  ...props
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);

  const routeSignature = useMemo(
    () => buildRouteSignature(pathname, searchParams),
    [pathname, searchParams],
  );

  useEffect(() => {
    setPending(false);
  }, [routeSignature]);

  const handleClick = (event) => {
    onClick?.(event);

    if (event.defaultPrevented) return;
    if (typeof event.button === "number" && event.button !== 0) return;
    if (isModifiedEvent(event)) return;

    setPending(true);
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      aria-busy={pending || undefined}
      data-pending={pending ? "true" : "false"}
      className={`${className} ${pending ? "pointer-events-none" : ""}`.trim()}
      {...props}
    >
      {variant === "inline" ? (
        <span className="inline-flex items-center gap-2">
          <span className={pending ? "opacity-70" : ""}>{children}</span>
          {pending ? (
            <Loader2
              size={spinnerSize}
              className="shrink-0 animate-spin text-cyan-300"
            />
          ) : null}
        </span>
      ) : (
        <div className="relative block">
          <div className={pending ? "opacity-40 blur-[0.2px]" : ""}>{children}</div>
          {pending ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/35 backdrop-blur-[2px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-black/20">
                <Loader2
                  size={spinnerSize}
                  className="shrink-0 animate-spin text-cyan-300"
                />
                {loadingLabel}
              </span>
            </span>
          ) : null}
        </div>
      )}
    </Link>
  );
}
