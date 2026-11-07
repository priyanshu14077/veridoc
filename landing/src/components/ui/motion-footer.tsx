"use client";

// Cinematic "curtain reveal" footer (third-party component, adapted).
// Changes from the original:
//  - content comes in as props (the original hard-coded another product's copy);
//  - GSAP is loaded on demand when the footer nears the screen, so it isn't in the first bundle;
//  - reduced motion: no scrubbed reveal, no breathing glow, no marquee, no magnetic pull;
//  - no runtime Google Fonts @import: it inherits the page's type.

import * as React from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Gsap = typeof import("gsap").gsap;
let gsapPromise: Promise<Gsap> | null = null;
/** Loads GSAP and ScrollTrigger once, on first use. */
function loadGsap(): Promise<Gsap> {
  gsapPromise ??= Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([g, st]) => {
    g.gsap.registerPlugin(st.ScrollTrigger);
    return g.gsap;
  });
  return gsapPromise;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// -------------------------------------------------------------------------
// 1. THEME-ADAPTIVE INLINE STYLES
// -------------------------------------------------------------------------
const STYLES = `
.cinematic-footer-wrapper {
  -webkit-font-smoothing: antialiased;

  /* Dynamic Variables using standard shadcn/tailwind v4 tokens */
  --pill-bg-1: color-mix(in oklch, var(--foreground) 3%, transparent);
  --pill-bg-2: color-mix(in oklch, var(--foreground) 1%, transparent);
  --pill-shadow: color-mix(in oklch, var(--foreground) 12%, transparent);
  --pill-highlight: color-mix(in oklch, var(--background) 90%, transparent);
  --pill-inset-shadow: color-mix(in oklch, var(--foreground) 6%, transparent);
  --pill-border: color-mix(in oklch, var(--foreground) 10%, transparent);

  --pill-bg-1-hover: color-mix(in oklch, var(--foreground) 8%, transparent);
  --pill-bg-2-hover: color-mix(in oklch, var(--foreground) 2%, transparent);
  --pill-border-hover: color-mix(in oklch, var(--foreground) 22%, transparent);
  --pill-shadow-hover: color-mix(in oklch, var(--foreground) 18%, transparent);
  --pill-highlight-hover: color-mix(in oklch, var(--background) 100%, transparent);
}

@keyframes footer-breathe {
  0% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
  100% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
}

@keyframes footer-scroll-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

@keyframes footer-heartbeat {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 5px color-mix(in oklch, var(--destructive) 50%, transparent)); }
  15%, 45% { transform: scale(1.2); filter: drop-shadow(0 0 10px color-mix(in oklch, var(--destructive) 80%, transparent)); }
  30% { transform: scale(1); }
}

.animate-footer-breathe { animation: footer-breathe 8s ease-in-out infinite alternate; }
.animate-footer-scroll-marquee { animation: footer-scroll-marquee 40s linear infinite; }
.animate-footer-heartbeat { animation: footer-heartbeat 2s cubic-bezier(0.25, 1, 0.5, 1) infinite; display: inline-block; }

/* The footer is fixed to the viewport (that's the curtain trick), so while its wrapper is off screen
   it is hidden and its animations are paused: otherwise the browser keeps repainting a large
   blurred glow nobody can see. */
.cinematic-footer-curtain:not([data-active]) .cinematic-footer-wrapper { visibility: hidden; }
.cinematic-footer-curtain:not([data-active]) :is(.animate-footer-breathe, .animate-footer-scroll-marquee, .animate-footer-heartbeat) { animation-play-state: paused; }

@media (prefers-reduced-motion: reduce) {
  .animate-footer-breathe, .animate-footer-scroll-marquee, .animate-footer-heartbeat { animation: none; }
}

/* Theme-adaptive Grid Background */
.footer-bg-grid {
  background-size: 60px 60px;
  background-image:
    linear-gradient(to right, color-mix(in oklch, var(--foreground) 4%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in oklch, var(--foreground) 4%, transparent) 1px, transparent 1px);
  mask-image: linear-gradient(to bottom, transparent, black 30%, black 70%, transparent);
  -webkit-mask-image: linear-gradient(to bottom, transparent, black 30%, black 70%, transparent);
}

/* Theme-adaptive Aurora Glow */
.footer-aurora {
  background: radial-gradient(
    circle at 50% 50%,
    color-mix(in oklch, var(--primary) 15%, transparent) 0%,
    color-mix(in oklch, var(--secondary) 15%, transparent) 40%,
    transparent 70%
  );
}

/* Glass Pill Theming */
.footer-glass-pill {
  background: linear-gradient(145deg, var(--pill-bg-1) 0%, var(--pill-bg-2) 100%);
  box-shadow:
      0 10px 30px -10px var(--pill-shadow),
      inset 0 1px 1px var(--pill-highlight),
      inset 0 -1px 2px var(--pill-inset-shadow);
  border: 1px solid var(--pill-border);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.footer-glass-pill:hover {
  background: linear-gradient(145deg, var(--pill-bg-1-hover) 0%, var(--pill-bg-2-hover) 100%);
  border-color: var(--pill-border-hover);
  box-shadow:
      0 20px 40px -10px var(--pill-shadow-hover),
      inset 0 1px 1px var(--pill-highlight-hover);
  color: var(--foreground);
}

/* Giant Background Text Masking */
.footer-giant-bg-text {
  font-size: 26vw;
  line-height: 0.75;
  font-weight: 600;
  letter-spacing: -0.05em;
  color: transparent;
  -webkit-text-stroke: 1px color-mix(in oklch, var(--foreground) 7%, transparent);
  background: linear-gradient(180deg, color-mix(in oklch, var(--foreground) 10%, transparent) 0%, transparent 60%);
  -webkit-background-clip: text;
  background-clip: text;
}

/* Metallic Text Glow */
.footer-text-glow {
  background: linear-gradient(180deg, var(--foreground) 0%, color-mix(in oklch, var(--foreground) 62%, transparent) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0px 0px 20px color-mix(in oklch, var(--foreground) 10%, transparent));
}
`;

// -------------------------------------------------------------------------
// 2. MAGNETIC BUTTON PRIMITIVE
// -------------------------------------------------------------------------
export type MagneticButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    as?: React.ElementType;
  };

const MagneticButton = React.forwardRef<HTMLElement, MagneticButtonProps>(
  ({ className, children, as: Component = "button", ...props }, forwardedRef) => {
    const localRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
      const element = localRef.current;
      if (!element || prefersReducedMotion() || !window.matchMedia("(hover: hover)").matches) return;
      let gsap: Gsap | null = null;
      let alive = true;

      const handleMouseMove = (e: MouseEvent) => {
        if (!gsap) return;
        const rect = element.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        gsap.to(element, { x: x * 0.4, y: y * 0.4, rotationX: -y * 0.15, rotationY: x * 0.15, scale: 1.05, ease: "power2.out", duration: 0.4 });
      };
      const handleMouseLeave = () => {
        gsap?.to(element, { x: 0, y: 0, rotationX: 0, rotationY: 0, scale: 1, ease: "elastic.out(1, 0.3)", duration: 1.2 });
      };
      // GSAP arrives on first hover.
      const handleEnter = () => {
        loadGsap().then((g) => {
          if (alive) gsap = g;
        });
      };

      element.addEventListener("mouseenter", handleEnter, { once: true });
      element.addEventListener("mousemove", handleMouseMove);
      element.addEventListener("mouseleave", handleMouseLeave);
      return () => {
        alive = false;
        element.removeEventListener("mouseenter", handleEnter);
        element.removeEventListener("mousemove", handleMouseMove);
        element.removeEventListener("mouseleave", handleMouseLeave);
        gsap?.killTweensOf(element);
      };
    }, []);

    return (
      <Component
        ref={(node: HTMLElement | null) => {
          localRef.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        className={cn("cursor-pointer", className)}
        {...props}
      >
        {children}
      </Component>
    );
  }
);
MagneticButton.displayName = "MagneticButton";

// -------------------------------------------------------------------------
// 3. MAIN COMPONENT
// -------------------------------------------------------------------------
export type FooterLink = { label: string; href: string; icon?: React.ReactNode };

export interface CinematicFooterProps {
  /** Phrases for the slanted marquee. */
  marquee: string[];
  /** The giant outlined word behind everything. */
  giantText: string;
  heading: string;
  primaryLinks: FooterLink[];
  secondaryLinks: FooterLink[];
  /** Bottom-left line (e.g. a disclaimer). */
  note: React.ReactNode;
  /** Name in the "Crafted with ❤ by" badge. */
  author: string;
  /** Extra content for the bottom bar (e.g. a status indicator). */
  status?: React.ReactNode;
}

const isExternal = (href: string) => /^https?:/.test(href);

function MarqueeItem({ phrases }: { phrases: string[] }) {
  return (
    <div className="flex items-center space-x-12 px-6">
      {phrases.map((p, i) => (
        <React.Fragment key={p}>
          <span>{p}</span>
          <span className={i % 2 ? "text-secondary" : "text-primary/70"}>✦</span>
        </React.Fragment>
      ))}
    </div>
  );
}

export function CinematicFooter({
  marquee,
  giantText,
  heading,
  primaryLinks,
  secondaryLinks,
  note,
  author,
  status,
}: CinematicFooterProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const giantTextRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);

  // Show (and animate) the fixed footer only while its wrapper is on screen.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) wrapper.setAttribute("data-active", "");
      else wrapper.removeAttribute("data-active");
    });
    io.observe(wrapper);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || prefersReducedMotion()) return;
    let ctx: { revert: () => void } | null = null;
    let cancelled = false;

    // Load GSAP only when the footer is getting close.
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        loadGsap().then((gsap) => {
          if (cancelled) return;
          ctx = gsap.context(() => {
            // Background Parallax
            gsap.fromTo(
              giantTextRef.current,
              { y: "10vh", scale: 0.8, opacity: 0 },
              {
                y: "0vh",
                scale: 1,
                opacity: 1,
                ease: "power1.out",
                scrollTrigger: { trigger: wrapper, start: "top 80%", end: "bottom bottom", scrub: 1 },
              }
            );

            // Staggered Content Reveal
            gsap.fromTo(
              [headingRef.current, linksRef.current],
              { y: 50, opacity: 0 },
              {
                y: 0,
                opacity: 1,
                stagger: 0.15,
                ease: "power3.out",
                scrollTrigger: { trigger: wrapper, start: "top 40%", end: "bottom bottom", scrub: 1 },
              }
            );
          }, wrapper);
        });
      },
      { rootMargin: "600px 0px" }
    );
    io.observe(wrapper);

    return () => {
      cancelled = true;
      io.disconnect();
      ctx?.revert();
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    document.getElementById("main")?.focus({ preventScroll: true });
  };

  const linkProps = (href: string) => (isExternal(href) ? { target: "_blank", rel: "noopener noreferrer" } : {});

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      {/*
        The "Curtain Reveal" Wrapper: it sits in normal flow, and its clip-path means the fixed
        footer inside is only visible within this box, as the page scrolls away above it.
      */}
      <div
        ref={wrapperRef}
        className="cinematic-footer-curtain relative h-screen w-full"
        style={{ clipPath: "polygon(0% 0, 100% 0%, 100% 100%, 0 100%)" }}
      >
        <footer className="cinematic-footer-wrapper fixed bottom-0 left-0 flex h-screen w-full flex-col justify-between overflow-hidden bg-background text-foreground">
          {/* Ambient Light & Grid Background */}
          <div className="footer-aurora animate-footer-breathe pointer-events-none absolute left-1/2 top-1/2 z-0 h-[60vh] w-[80vw] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-[80px]" />
          <div className="footer-bg-grid pointer-events-none absolute inset-0 z-0" />

          {/* Giant background text */}
          <div
            ref={giantTextRef}
            aria-hidden="true"
            className="footer-giant-bg-text pointer-events-none absolute -bottom-[5vh] left-1/2 z-0 -translate-x-1/2 whitespace-nowrap select-none"
          >
            {giantText}
          </div>

          {/* 1. Diagonal Sleek Marquee (Top of footer) */}
          <div
            aria-hidden="true"
            className="absolute top-12 left-0 z-10 w-full -rotate-2 scale-110 overflow-hidden border-y border-border bg-background/70 py-4 shadow-2xl shadow-foreground/5 backdrop-blur-md"
          >
            <div className="animate-footer-scroll-marquee flex w-max text-xs font-semibold tracking-[0.3em] text-muted-foreground uppercase md:text-sm">
              <MarqueeItem phrases={marquee} />
              <MarqueeItem phrases={marquee} />
            </div>
          </div>

          {/* 2. Main Center Content */}
          <div className="relative z-10 mx-auto mt-20 flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6">
            <h2
              ref={headingRef}
              className="display footer-text-glow mb-12 text-center text-5xl tracking-tight md:text-8xl"
            >
              {heading}
            </h2>

            {/* Interactive Magnetic Pills Layout */}
            <div ref={linksRef} className="flex w-full flex-col items-center gap-6">
              <div className="flex w-full flex-wrap justify-center gap-4">
                {primaryLinks.map((l) => (
                  <MagneticButton
                    key={l.href}
                    as="a"
                    href={l.href}
                    {...linkProps(l.href)}
                    className="footer-glass-pill group flex items-center gap-3 rounded-full px-8 py-4 text-sm font-semibold text-foreground md:px-10 md:py-5 md:text-base"
                  >
                    {l.icon}
                    {l.label}
                    {isExternal(l.href) && <span className="sr-only"> (opens in a new tab)</span>}
                  </MagneticButton>
                ))}
              </div>

              <div className="mt-2 flex w-full flex-wrap justify-center gap-3 md:gap-6">
                {secondaryLinks.map((l) => (
                  <MagneticButton
                    key={l.href}
                    as="a"
                    href={l.href}
                    {...linkProps(l.href)}
                    className="footer-glass-pill rounded-full px-6 py-3 text-xs font-medium text-muted-foreground hover:text-foreground md:text-sm"
                  >
                    {l.label}
                    {isExternal(l.href) && <span className="sr-only"> (opens in a new tab)</span>}
                  </MagneticButton>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Bottom Bar / Credits */}
          <div className="relative z-20 flex w-full flex-col items-center justify-between gap-4 px-6 pb-8 md:flex-row md:px-12">
            <div className="order-2 flex flex-col items-center gap-1 text-center text-xs text-muted-foreground md:order-1 md:items-start md:text-left">
              <span>{note}</span>
              {status}
            </div>

            <div className="footer-glass-pill order-1 flex cursor-default items-center gap-2 rounded-full px-6 py-3 md:order-2">
              <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase md:text-xs">Crafted with</span>
              <span aria-label="love" role="img" className="animate-footer-heartbeat text-sm text-destructive md:text-base">
                ❤
              </span>
              <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase md:text-xs">by</span>
              <span className="ml-1 text-xs font-semibold text-foreground md:text-sm">{author}</span>
            </div>

            <MagneticButton
              as="button"
              type="button"
              onClick={scrollToTop}
              aria-label="Back to top"
              className="footer-glass-pill group order-3 flex size-12 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <svg aria-hidden="true" className="size-5 transition-transform duration-300 group-hover:-translate-y-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </MagneticButton>
          </div>
        </footer>
      </div>
    </>
  );
}
