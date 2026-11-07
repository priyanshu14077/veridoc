import { ArrowRight, FileSpreadsheet } from "lucide-react";
import { fits } from "@/content";
import { Wordmark } from "./nav";
import { Section, SectionHeader } from "./ui";

export function Fits() {
  return (
    <Section labelledBy="fits-title">
      <SectionHeader id="fits-title" eyebrow="No migration" title={fits.title} intro={fits.body} />
      <figure className="mt-12">
        <div
          role="img"
          aria-label="Diagram: Veridoc exports a CSV. Every version (v1, v2, v3) is kept. The CSV is imported by the broker's existing customs filing software."
          className="grid items-center gap-3 rounded-xl border border-line bg-surface p-5 sm:p-8 md:grid-cols-[1fr_auto_1.3fr_auto_1fr]"
        >
          <div aria-hidden className="contents">
            <Box>
              <Wordmark />
              <p className="mt-1 text-xs text-muted">Reviewed and cleared</p>
            </Box>
            <Arrow />
            <Box>
              <p className="flex items-center gap-2 text-sm text-ink">
                <FileSpreadsheet className="size-4 text-accent" /> CSV export
              </p>
              <div className="mt-3 flex gap-2">
                {fits.versions.map((v, i) => (
                  <span
                    key={v}
                    className={`mono rounded border px-2 py-1 text-xs ${
                      i === fits.versions.length - 1 ? "border-accent/60 text-ink" : "border-line text-muted"
                    }`}
                  >
                    {v}
                  </span>
                ))}
                <span className="mono px-1 py-1 text-xs text-muted">…</span>
              </div>
            </Box>
            <Arrow />
            <Box>
              <p className="text-sm text-ink">Existing customs filing software</p>
              <p className="mt-1 text-xs text-muted">Unchanged</p>
            </Box>
          </div>
        </div>
        <figcaption className="mt-3 text-sm text-muted">{fits.versionNote}</figcaption>
      </figure>
    </Section>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-line bg-surface-2 p-4">{children}</div>;
}

function Arrow() {
  return (
    <div className="flex justify-center text-line-strong">
      <ArrowRight className="size-5 rotate-90 md:rotate-0" />
    </div>
  );
}
