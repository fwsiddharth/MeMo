"use client";

import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "../../lib/utils";

export function Switch({ className, ...props }) {
  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] transition-colors data-[state=checked]:border-[color:var(--text-primary)] data-[state=checked]:bg-[color:var(--text-primary)]",
        className,
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-[color:var(--background)] shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitives.Root>
  );
}
