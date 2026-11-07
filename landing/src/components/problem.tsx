import { problem } from "@/content";
import { Section, SectionHeader } from "./ui";

export function Problem() {
  return (
    <Section labelledBy="problem-title">
      <SectionHeader id="problem-title" eyebrow="The problem" title={problem.title} intro={problem.intro} />
      <ul className="mt-12 grid gap-4 md:grid-cols-3">
        {problem.stats.map((s) => (
          <li key={s.unit}>
            <div className="h-full rounded-xl border border-line bg-surface p-6">
              <p className="mono text-4xl font-medium tracking-tight text-ink sm:text-5xl">{s.value}</p>
              <p className="mt-2 text-sm font-medium text-ink-2">{s.unit}</p>
              <p className="mt-4 text-sm leading-relaxed text-muted">{s.note}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-1 rounded-xl border border-line bg-surface px-6 py-5 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-sm text-muted">{problem.totalNote}</p>
        <p className="mono text-2xl font-medium text-ink">{problem.total}</p>
      </div>
    </Section>
  );
}
