"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { links, nav } from "@/content";
import { ButtonLink, Container, Wordmark } from "./ui";

/** The nav section whose band crosses the middle of the viewport, or null above the first one. */
function useActiveSection() {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = nav.map((n) => document.querySelector(n.href)).filter((el): el is Element => el !== null);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(`#${e.target.id}`);
      },
      { rootMargin: "-45% 0px -54% 0px" },
    );
    els.forEach((el) => io.observe(el));
    // Back above the first section: nothing is active.
    const top = () => {
      const first = els[0];
      if (first && first.getBoundingClientRect().top > window.innerHeight * 0.46) setActive(null);
    };
    window.addEventListener("scroll", top, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", top);
    };
  }, []);
  return active;
}

export function Nav() {
  const active = useActiveSection();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-4">
        <a href="#main" className="transition-opacity duration-300 hover:opacity-80">
          <Wordmark />
        </a>
        <nav aria-label="Sections" className="hidden md:block">
          <ul className="flex items-center gap-1 text-sm">
            {nav.map((item) => {
              const on = active === item.href;
              return (
                <li key={item.href} className="relative">
                  {on && (
                    <motion.span
                      layoutId="nav-pill"
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-info-soft"
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                  )}
                  <a
                    href={item.href}
                    aria-current={on ? "true" : undefined}
                    className={`relative block rounded-full px-3.5 py-1.5 transition-colors duration-300 ${
                      on ? "text-ink" : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex items-center gap-1">
          <a
            href={links.demo}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden rounded-full px-3.5 py-2 text-sm text-ink-2 transition-colors duration-300 hover:text-ink sm:block"
          >
            Sign in<span className="sr-only"> to the demo (opens in a new tab)</span>
          </a>
          <ButtonLink href={links.demo} external className="min-h-10 px-4">
            <span className="hidden sm:inline">Try the live demo</span>
            <span className="sm:hidden">Live demo</span>
          </ButtonLink>
        </div>
      </Container>
      <div aria-hidden className="scroll-progress absolute inset-x-0 -bottom-px h-px bg-accent/60" />
    </header>
  );
}
