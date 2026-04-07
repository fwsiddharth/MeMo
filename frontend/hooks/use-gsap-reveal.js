"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let registered = false;

export function useGsapReveal(options = {}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!options.enabled) return;
    if (!registered) {
      gsap.registerPlugin(ScrollTrigger);
      registered = true;
    }

    if (!ref.current) return;

    const element = ref.current;
    const tween = gsap.fromTo(
      element,
      {
        opacity: 0,
        y: options.fromY ?? 32,
        scale: options.fromScale ?? 0.98,
      },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: options.duration ?? 0.8,
        ease: options.ease ?? "power2.out",
        scrollTrigger: {
          trigger: element,
          start: options.start ?? "top 85%",
          once: options.once ?? true,
        },
      },
    );

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [options.duration, options.ease, options.fromScale, options.fromY, options.once, options.start, options.enabled]);

  return ref;
}
