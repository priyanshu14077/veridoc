import { targets } from "@/content";
import { CountUp } from "./motion";
import { Backdrop } from "./backdrop";
import { Eyebrow, Section, TwoTone, stagger } from "./ui";

/** The client's targets, in the place other pages put a customer story. Labelled as targets. */
export function Targets() {
  return (
    <Section labelledBy="targets-title">
      <div className="reveal grid grid-cols-1 overflow-hidden rounded-2xl border border-line bg-surface p-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Backdrop image="aurorix" position="20% 50%" className="min-h-64 rounded-xl lg:min-h-full">
          <div className="flex h-full items-end p-5">
            <span className="rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink backdrop-blur">
              Target, not a result
            </span>
          </div>
        </Backdrop>
        <div className="p-6 sm:p-10">
          <Eyebrow>{targets.eyebrow}</Eyebrow>
          <TwoTone id="targets-title" title={targets.title} className="mt-4 text-3xl sm:text-4xl" />
          <p className="mt-5 max-w-xl leading-relaxed text-ink-2">{targets.statement}</p>
          <ul className="mt-10 grid grid-cols-1 gap-6 border-t border-line pt-8 sm:grid-cols-3">
            {targets.items.map((t, i) => (
              <li key={t.label} className="reveal" style={stagger(i)}>
                <p className="display text-4xl text-ink">
                  <CountUp value={t.value} from={t.countFrom} />
                </p>
                <p className="mt-2 text-sm font-medium text-ink">{t.label}</p>
                <p className="mt-0.5 text-sm text-muted">{t.from}</p>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-xs text-muted">{targets.note}</p>
        </div>
      </div>
    </Section>
  );
}
