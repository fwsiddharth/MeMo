import { cn } from "../../lib/utils";

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-[6px] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--text-primary)] focus:ring-2 focus:ring-[color:var(--accent-soft)]",
        className,
      )}
      {...props}
    />
  );
}
