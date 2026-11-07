import { targets } from "@/content";
import { CountUp } from "./motion";
import { Eyebrow, Section, TwoTone, stagger } from "./primitives";

/** The client's targets, in the place other pages put a customer story. Labelled as targets. */
export function Targets() {
  return (
    <Section labelledBy="targets-title" backdrop={{ image: "piano", position: "50% 55%", wash: "deep" }}>
      <div className="grid grid-cols-1 items-end gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <div>
          <Eyebrow tone="dark" className="reveal">
            {targets.eyebrow}
          </Eyebrow>
          <TwoTone id="targets-title" title={targets.title} tone="dark" className="mt-4 text-4xl sm:text-5xl" />
          <p className="reveal mt-5 max-w-xl leading-relaxed text-white/80" style={stagger(3)}>
            {targets.statement}
          </p>
          <span className="reveal mt-6 inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
            Target, not a result
          </span>
        </div>
        <div className="reveal rounded-2xl border border-white/15 bg-black/45 p-6 sm:p-8">
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {targets.items.map((t, i) => (
              <li key={t.label} className="reveal" style={stagger(i)}>
                <p className="display text-4xl text-white">
                  <CountUp value={t.value} from={t.countFrom} />
                </p>
                <p className="mt-2 text-sm font-medium text-white">{t.label}</p>
                <p className="mt-0.5 text-sm text-white/75">{t.from}</p>
              </li>
            ))}
          </ul>
          <p className="mt-8 border-t border-white/15 pt-5 text-xs text-white/70">{targets.note}</p>
        </div>
      </div>
    </Section>
  );
}
