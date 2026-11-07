"use client";

import { useEffect, useState } from "react";
import { footer, links } from "@/content";
import { Container, Wordmark } from "./ui";

type Health = "checking" | "up" | "down";

/**
 * Whether the live demo answers. The API sends no CORS headers, so from another origin the body
 * can't be read; an opaque request only proves the server responded. Hence "reachable", not "healthy".
 */
function useDemoHealth(): Health {
  const [h, setH] = useState<Health>("checking");
  useEffect(() => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    (async () => {
      try {
        // Same origin: a readable response. Cross-origin: an opaque one, which still proves the
        // server answered. Either way no CORS error is logged.
        const r = await fetch(links.health, { mode: "no-cors", signal: ctl.signal, cache: "no-store" });
        setH(r.type === "opaque" || r.ok ? "up" : "down");
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
  const text = { checking: "Checking the live demo…", up: "Live demo reachable", down: "Live demo not reachable right now" }[health];
  return (
    <footer className="border-t border-line bg-surface">
      <Container className="grid grid-cols-1 gap-10 py-14 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">{footer.blurb}</p>
        </div>
        {footer.columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-sm font-medium text-ink">{col.title}</p>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => {
                const external = l.href.startsWith("http");
                return (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="text-sm text-muted transition-colors duration-300 hover:text-ink"
                    >
                      {l.label}
                      {external && <span className="sr-only"> (opens in a new tab)</span>}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        ))}
      </Container>
      <Container className="flex flex-col gap-3 border-t border-line py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>{footer.fiction}</p>
        <p className="flex items-center gap-2" role="status" aria-live="polite">
          <span className="relative flex size-2">
            {health === "up" && <span className="absolute inline-flex size-full rounded-full bg-clear opacity-50 motion-safe:animate-ping" />}
            <span className={`relative size-2 rounded-full ${dot}`} />
          </span>
          {text}
        </p>
      </Container>
    </footer>
  );
}
