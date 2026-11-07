import { Database, EyeOff, FileLock2, KeyRound, ScrollText, ShieldCheck } from "lucide-react";
import { security } from "@/content";
import { Backdrop } from "./backdrop";
import { Spotlight } from "./motion";
import { Section, SectionHeader, stagger } from "./primitives";

const icons = [KeyRound, ShieldCheck, EyeOff, FileLock2, ScrollText, Database];

export function Security() {
  return (
    <Section id="security" labelledBy="security-title" className="relative isolate overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-10">
        <Backdrop image="aurorix" position="50% 60%" className="size-full" />
        {/* Soften the steel so ink text and white cards keep their contrast. */}
        <div className="absolute inset-0 bg-gradient-to-b from-paper/80 via-paper/35 to-paper/80" />
      </div>
      <SectionHeader id="security-title" eyebrow={security.eyebrow} title={security.title} center />
      <ul className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {security.items.map((c, i) => {
          const Icon = icons[i];
          return (
            <li key={c.title} className="reveal" style={stagger(i % 3)}>
              <Spotlight className="group h-full rounded-xl border border-white/70 bg-surface/95 p-6 shadow-[0_10px_30px_-18px_rgb(13_20_40/0.5)] transition-[border-color,box-shadow,transform] duration-500 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-18px_rgb(13_20_40/0.55)]">
                <span className="grid size-9 place-items-center rounded-lg border border-line bg-paper text-ink-2 transition-[color,transform] duration-500 ease-smooth group-hover:-translate-y-0.5 group-hover:text-accent">
                  <Icon aria-hidden className="size-4" />
                </span>
                <h3 className="mt-6 font-semibold text-ink">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>
              </Spotlight>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
