"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * Plays a sequence when the element scrolls into view.
 *
 * The server renders the finished state, so the page reads correctly without JS. On mount, if the
 * element is still below the fold (nobody has seen it yet), it is reset to the start and plays once
 * when it comes into view. If it is already on screen, or motion is reduced, it stays finished.
 */
export function usePlayOnView<T extends Element = HTMLDivElement>(amount = 0.5) {
  const ref = useRef<T>(null);
  const inView = useInView(ref, { once: true, amount });
  const reduce = useReducedMotion();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    // Reset only content nobody has seen; reading layout once on mount is fine.
    if (el.getBoundingClientRect().top > window.innerHeight) setArmed(true);
  }, [reduce]);

  return { ref, armed, play: armed && inView };
}

/** "1,100", "₹70.29 lakh", "< 15 min": counts the number inside a label, keeping its prefix and suffix. */
export function CountUp({ value, from = 0, duration = 1.4 }: { value: string; from?: number; duration?: number }) {
  const m = value.match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
  const { ref, armed, play } = usePlayOnView<HTMLSpanElement>(0.8);
  const target = m ? Number(m[2].replace(/,/g, "")) : 0;
  const decimals = m?.[2].split(".")[1]?.length ?? 0;
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    if (!play) return;
    const controls = animate(from, target, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: setN });
    return () => controls.stop();
  }, [play, from, target, duration]);

  if (!m) return <span>{value}</span>;
  const shown = n ?? (armed ? from : target);
  const text = shown.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <span ref={ref}>
      {/* The final value for screen readers; the ticking digits are decoration. */}
      <span className="sr-only">{value}</span>
      <span aria-hidden>
        {m[1]}
        {text}
        {m[3]}
      </span>
    </span>
  );
}

/** Sets --x/--y on the element from the pointer, for the .spotlight hover glow. */
export function useSpotlight<T extends HTMLElement>() {
  return {
    onPointerMove(e: React.PointerEvent<T>) {
      const r = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty("--x", `${e.clientX - r.left}px`);
      e.currentTarget.style.setProperty("--y", `${e.clientY - r.top}px`);
    },
  };
}

export function Spotlight({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div {...useSpotlight<HTMLDivElement>()} className={`spotlight ${className}`}>
      {children}
    </div>
  );
}
