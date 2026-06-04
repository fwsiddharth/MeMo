import { cn } from "../../lib/utils";

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-[6px] border border-[color:var(--border)] bg-[color:var(--surface-elevated)] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,0.05)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn("p-4 pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn("app-mono text-base font-medium tracking-[-0.03em] text-[color:var(--text-primary)]", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn("text-sm leading-6 text-[color:var(--text-secondary)]", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn("p-4", className)} {...props} />;
}
