"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Backgrounds from public/media (optimised copies of the source art in /design-assets).
 *
 * - Images drift with scroll (a CSS scroll-driven parallax zoom: no JS, off the main thread).
 * - The hero video plays only while on screen, never with reduced motion (the poster stays).
 */

export type BackdropImage =
  | "velvex" // navy hills, lake
  | "aurorix" // steel ribbon
  | "perplex" // glowing portal
  | "horizon" // molten planet
  | "nocturne" // night mountain, lit cabin
  | "reverie" // underwater light
  | "meadow" // painted flower meadow
  | "saxophone" // painted saxophone in surf
  | "piano"; // painted piano and score

// Each image's dominant colour, shown while it loads (never a white flash).
const ALT_TONE: Record<BackdropImage, string> = {
  velvex: "bg-[#1b2740]",
  aurorix: "bg-[#c9ced6]",
  perplex: "bg-[#0c0d10]",
  horizon: "bg-[#120c08]",
  nocturne: "bg-[#0a0a0a]",
  reverie: "bg-[#0a1630]",
  meadow: "bg-[#7f9d6e]",
  saxophone: "bg-[#1d4a3c]",
  piano: "bg-[#3c5a55]",
};

/** How a section darkens or lightens its photo so text on it stays readable (≥ 4.5:1). */
export type Wash = "dark" | "deep" | "light";
const WASH: Record<Wash, string> = {
  // White text: an even dark wash, a little heavier at the top and bottom edges.
  dark: "bg-[linear-gradient(180deg,rgb(7_9_14/0.82)_0%,rgb(7_9_14/0.6)_35%,rgb(7_9_14/0.6)_65%,rgb(7_9_14/0.85)_100%)]",
  // White text over a very bright or busy image.
  deep: "bg-[linear-gradient(180deg,rgb(7_9_14/0.88)_0%,rgb(7_9_14/0.72)_40%,rgb(7_9_14/0.72)_60%,rgb(7_9_14/0.9)_100%)]",
  // Dark text: a soft mist at the top, where the heading sits, clearing towards the bottom.
  light: "bg-[linear-gradient(180deg,rgb(238_241_246/0.86)_0%,rgb(238_241_246/0.55)_38%,rgb(238_241_246/0.25)_100%)]",
};

/** A photo behind a whole section, with its wash. Purely decorative. */
export function SectionBackdrop({
  image,
  position = "50% 50%",
  wash,
}: {
  image: BackdropImage;
  position?: string;
  wash: Wash;
}) {
  return (
    <div aria-hidden className="absolute inset-0 -z-10">
      <Backdrop image={image} position={position} className="size-full" sizes="100vw" />
      <div className={`absolute inset-0 ${WASH[wash]}`} />
      {/* Feathered edges: each photo dissolves into the night between sections, no hard seams. */}
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#07080c]/85 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#07080c]/85 to-transparent" />
    </div>
  );
}

export function Backdrop({
  image,
  position = "50% 50%",
  className = "",
  imgClassName = "",
  priority = false,
  sizes = "(min-width: 1024px) 60vw, 100vw",
  children,
}: {
  image: BackdropImage;
  position?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  sizes?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`relative isolate overflow-hidden ${ALT_TONE[image]} ${className}`}>
      {/* Decorative: empty alt. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- static export; files are pre-optimised */}
      <img
        src={`/media/${image}-1200.webp`}
        srcSet={`/media/${image}-1200.webp 1200w, /media/${image}-2400.webp 2400w`}
        sizes={sizes}
        alt=""
        loading={priority ? "eager" : "lazy"}
        // Backgrounds never compete with the hero's first frame for bandwidth.
        fetchPriority={priority ? "high" : "low"}
        decoding="async"
        className={`parallax absolute inset-0 size-full object-cover ${imgClassName}`}
        style={{ objectPosition: position }}
      />
      {children && <div className="relative h-full">{children}</div>}
    </div>
  );
}

export function HeroVideo({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return; // the still frame is the hero
    // The video is decoration: fetch it only after the page has loaded and the browser is idle,
    // so it never competes with the page's own files for bandwidth.
    let idle = 0;
    const attach = () => {
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      idle = ric ? ric(load, { timeout: 2500 }) : window.setTimeout(load, 500);
    };
    const load = () => {
      v.src = window.matchMedia("(max-width: 1023px)").matches ? "/media/hero-720.mp4" : "/media/hero-1920.mp4";
      io.observe(v);
    };
    if (document.readyState === "complete") attach();
    else window.addEventListener("load", attach, { once: true });
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !reduce.matches && !document.hidden) v.play().catch(() => {});
      else v.pause();
    });
    const onReduce = () => (reduce.matches ? v.pause() : v.play().catch(() => {}));
    reduce.addEventListener("change", onReduce);
    const onPlaying = () => setPlaying(true);
    v.addEventListener("playing", onPlaying);
    return () => {
      window.removeEventListener("load", attach);
      const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      if (cic) cic(idle); else clearTimeout(idle);
      io.disconnect();
      reduce.removeEventListener("change", onReduce);
      v.removeEventListener("playing", onPlaying);
    };
  }, []);

  return (
    <div className={`relative size-full ${className}`}>
      {/* The still frame paints at once (it's the largest thing on screen); the video fades in over
          it once it is actually playing, so the first paint never waits for video data. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- static export; file is pre-optimised */}
      <img
        src="/media/hero-poster-720.webp"
        srcSet="/media/hero-poster-720.webp 720w, /media/hero-poster.webp 1440w"
        sizes="(max-width: 640px) 60vw, 100vw"
        alt=""
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
      <video
        ref={ref}
        aria-hidden
        muted
        loop
        playsInline
        preload="none"
        className={`absolute inset-0 size-full object-cover transition-opacity duration-700 ${playing ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
