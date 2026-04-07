"use client";

import { useGsapReveal } from "../hooks/use-gsap-reveal";
import { useClientSettings } from "./ClientSettingsProvider";

export default function AnimatedSection({ children, className = "", delay = 0 }) {
  const {
    settings: { uiAnimations: enabled = true },
  } = useClientSettings();

  const ref = useGsapReveal({
    duration: 0.8 + delay * 0.02,
    fromY: 24 + delay * 1.2,
    enabled,
  });

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
