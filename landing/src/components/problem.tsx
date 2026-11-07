import { problem } from "@/content";
import { CountUp } from "./motion";
import { Section, SectionHeader, stagger } from "./primitives";

export function Problem() {
  return (
    <Section labelledBy="problem-title" backdrop={{ image: "horizon", position: "70% 40%", wash: "deep" }}>
      <SectionHeader id="problem-title" eyebrow={problem.eyebrow} title={problem.title} intro={problem.intro} tone="dark" />
      <ul className="mt-14 grid grid-cols-1 gap-3 md:grid-cols-3">
        {problem.stats.map((s, i) => (
          <li key={s.unit} className="reveal rounded-2xl border border-white/15 bg-black/45 p-6 sm:p-8" style={stagger(i)}>
            <p className="display text-5xl text-white sm:text-6xl">
              <CountUp value={s.value} />
            </p>
            <p className="mt-3 text-sm font-medium text-white">{s.unit}</p>
            <p className="mt-2 text-sm leading-relaxed text-white/75">{s.note}</p>
          </li>
        ))}
      </ul>
      <div className="reveal mt-3 flex flex-col gap-1 rounded-2xl border border-[#ff8a7a]/35 bg-[#3a0d08]/70 px-6 py-5 sm:flex-row sm:items-baseline sm:justify-between sm:px-8">
        <p className="text-sm text-white/80">{problem.totalNote}</p>
        <p className="display text-3xl text-[#ffb3a8]">
          <CountUp value={problem.total} duration={1.8} />
        </p>
      </div>
    </Section>
  );
}
