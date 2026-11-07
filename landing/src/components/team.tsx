import { Check } from "lucide-react";
import { team } from "@/content";
import { Section, SectionHeader } from "./ui";

export function Team() {
  return (
    <Section labelledBy="team-title">
      <SectionHeader
        id="team-title"
        eyebrow="Built for the team"
        title="Two roles, matched to how a documentation team already works"
      />
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {team.map((t) => (
          <div key={t.role} className="rounded-xl border border-line bg-surface p-6 sm:p-8">
            <h3 className="text-xl font-semibold">{t.role}</h3>
            <p className="mt-1 text-sm text-muted">{t.summary}</p>
            <ul className="mt-6 space-y-3">
              {t.points.map((p) => (
                <li key={p} className="flex gap-3 text-sm leading-relaxed text-ink-2">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span>
                    {p.includes("J / K") ? (
                      <>
                        Keyboard review: <Kbd>J</Kbd> / <Kbd>K</Kbd> for the next flag, <Kbd>Enter</Kbd> to confirm,{" "}
                        <Kbd>E</Kbd> to edit
                      </>
                    ) : (
                      p
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mono rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink">{children}</kbd>
  );
}
