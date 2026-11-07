import { Database, EyeOff, FileLock2, KeyRound, ScrollText, ShieldCheck } from "lucide-react";
import { security } from "@/content";
import { Spotlight } from "./motion";
import { Section, SectionHeader, stagger } from "./ui";

const icons = [KeyRound, ShieldCheck, EyeOff, FileLock2, ScrollText, Database];

export function Security() {
  return (
    <Section id="security" labelledBy="security-title" className="border-y border-line bg-sunk">
      <SectionHeader id="security-title" eyebrow={security.eyebrow} title={security.title} center />
      <ul className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {security.items.map((c, i) => {
          const Icon = icons[i];
          return (
            <li key={c.title} className="reveal" style={stagger(i % 3)}>
              <Spotlight className="group h-full rounded-xl border border-line bg-surface p-6 transition-[border-color,box-shadow] duration-500 hover:border-line-strong hover:shadow-[0_8px_30px_-12px_rgb(28_29_31/0.18)]">
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
