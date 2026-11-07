"use client";

import { LayoutDashboard, ListOrdered, MessageCircleQuestion, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { links, nav } from "@/content";
import { NotchNav, type NotchItemData } from "./ui/adaptive-notch-navigation-bar";
import { Logo } from "./primitives";

const ICONS = [ListOrdered, LayoutDashboard, ShieldCheck, MessageCircleQuestion];
const ITEMS: NotchItemData[] = nav.map((n, i) => ({ id: n.href.slice(1), label: n.label, icon: ICONS[i] }));

/** The section whose band crosses the middle of the viewport, or "" above the first one. */
function useActiveSection() {
  const [active, setActive] = useState("");
  useEffect(() => {
    const els = ITEMS.map((n) => document.getElementById(n.id)).filter((el): el is HTMLElement => el !== null);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -54% 0px" },
    );
    els.forEach((el) => io.observe(el));
    const top = () => {
      const first = els[0];
      if (first && first.getBoundingClientRect().top > window.innerHeight * 0.46) setActive("");
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

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <>
      <NotchNav
        layout="overlay"
        aria-label="Site"
        items={ITEMS}
        activeId={active}
        onActiveChange={go}
        logo={
          <a href="#main" className="flex h-8.5 items-center gap-2 text-sm font-semibold tracking-tight text-zinc-50">
            <Logo className="size-5" />
            <span className="sr-only sm:not-sr-only">Veridoc</span>
          </a>
        }
        rightContent={
          <div className="flex h-8.5 items-center gap-3">
            <a
              href={links.demo}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100 sm:block"
            >
              Sign in<span className="sr-only"> to the demo (opens in a new tab)</span>
            </a>
            <a
              href={links.demo}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
            >
              <span className="hidden sm:inline">Try the live demo</span>
              <span className="sm:hidden">Demo</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        }
      />
      {/* Reading progress along the very top edge. */}
      <div aria-hidden className="scroll-progress fixed inset-x-0 top-0 z-40 h-0.5 bg-accent/70" />
    </>
  );
}
