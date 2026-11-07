import { targets } from "@/content";
import { Section, SectionHeader } from "./ui";

export function Targets() {
  return (
    <Section labelledBy="targets-title">
      <SectionHeader id="targets-title" eyebrow="Targets" title={targets.title} intro={targets.note} />
      <ul className="mt-12 grid gap-4 md:grid-cols-3">
        {targets.items.map((t) => (
          <li key={t.label}>
            <div className="h-full rounded-xl border border-dashed border-line-strong p-6">
              <p className="mono text-xs uppercase tracking-wider text-muted">Target</p>
              <p className="mono mt-3 text-4xl font-medium tracking-tight">{t.value}</p>
              <p className="mt-2 text-sm font-medium text-ink-2">{t.label}</p>
              <p className="mt-1 text-sm text-muted">{t.from}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
