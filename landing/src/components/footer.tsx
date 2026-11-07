"use client";

import { ArrowUpRight, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { footer, links, sameOrigin } from "@/content";
import { SectionBackdrop } from "./backdrop";
import { CinematicFooter } from "./ui/motion-footer";

type Health = "checking" | "up" | "down";

/**
 * Whether the live demo is up. Served from the app's own address (production), the health
 * response is read: "healthy" means /api/health said {"status":"ok"}. From another origin (local
 * development) the API sends no CORS headers, so an opaque request only proves the server
 * answered: "reachable".
 */
function useDemoHealth(): Health {
  const [h, setH] = useState<Health>("checking");
  useEffect(() => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    (async () => {
      try {
        if (sameOrigin) {
          const r = await fetch(links.health, { signal: ctl.signal, cache: "no-store" });
          const body = r.ok ? ((await r.json()) as { status?: string }) : null;
          setH(body?.status === "ok" ? "up" : "down");
        } else {
          const r = await fetch(links.health, { mode: "no-cors", signal: ctl.signal, cache: "no-store" });
          setH(r.type === "opaque" || r.ok ? "up" : "down");
        }
      } catch {
        setH("down");
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, []);
  return h;
}

export function Footer() {
  const health = useDemoHealth();
  const dot = { checking: "bg-line-strong", up: "bg-clear", down: "bg-conflict" }[health];
  const text = { checking: "Checking the live demo…", up: sameOrigin ? "Live demo healthy" : "Live demo reachable", down: "Live demo not reachable right now" }[health];
  const icons = [<ArrowUpRight key="d" aria-hidden className="size-5 text-primary" />, <FileText key="t" aria-hidden className="size-5 text-muted-foreground transition-colors group-hover:text-foreground" />];

  return (
    <CinematicFooter
      className="theme-night"
      background={<SectionBackdrop image="nocturne" position="50% 60%" wash="dark" />}
      marquee={footer.marquee}
      giantText={footer.giantText}
      heading={footer.heading}
      primaryLinks={footer.primary.map((l, i) => ({ ...l, icon: icons[i] }))}
      secondaryLinks={footer.secondary}
      note={footer.note}
      author={footer.author}
      status={
        <span className="flex items-center gap-2" role="status" aria-live="polite">
          <span className="relative flex size-2">
            {health === "up" && <span className="absolute inline-flex size-full rounded-full bg-clear opacity-50 motion-safe:animate-ping" />}
            <span className={`relative size-2 rounded-full ${dot}`} />
          </span>
          {text}
        </span>
      }
    />
  );
}
