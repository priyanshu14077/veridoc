import { problem } from "@/content";
import { CountUp } from "./motion";
import { Section, SectionHeader, stagger } from "./primitives";

export function Problem() {
  return (
    <Section labelledBy="problem-title">
      <SectionHeader id="problem-title" eyebrow={problem.eyebrow} title={problem.title} intro={problem.intro} />
      <ul className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
        {problem.stats.map((s, i) => (
          <li key={s.unit} className="reveal bg-surface p-6 sm:p-8" style={stagger(i)}>
            <p className="display text-5xl text-ink sm:text-6xl">
              <CountUp value={s.value} />
            </p>
            <p className="mt-3 text-sm font-medium text-ink">{s.unit}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.note}</p>
          </li>
        ))}
      </ul>
      <div className="reveal mt-4 flex flex-col gap-1 rounded-2xl border border-conflict/20 bg-conflict-soft px-6 py-5 sm:flex-row sm:items-baseline sm:justify-between sm:px-8">
        <p className="text-sm text-ink-2">{problem.totalNote}</p>
        <p className="display text-3xl text-conflict">
          <CountUp value={problem.total} duration={1.8} />
        </p>
      </div>
    </Section>
  );
}
