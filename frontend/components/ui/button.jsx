"use client";

import { cva } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[6px] text-sm font-medium transition duration-200 disabled:pointer-events-none disabled:opacity-50",
  {
      variants: {
        variant: {
        default: "border border-[color:var(--text-primary)] bg-[color:var(--text-primary)] text-[color:var(--background)] hover:opacity-90 active:opacity-80",
        secondary: "border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-elevated)]",
        ghost: "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface)] hover:text-[color:var(--text-primary)]",
        danger: "border border-red-600 bg-red-600 text-white hover:opacity-90",
        },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-[6px] px-3 text-xs",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
