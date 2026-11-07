import { Database, EyeOff, FileLock2, KeyRound, ScrollText, ShieldCheck } from "lucide-react";
import { security } from "@/content";
import { Section, SectionHeader } from "./ui";

const icons = [KeyRound, ShieldCheck, EyeOff, FileLock2, ScrollText, Database];

export function Security() {
  return (
    <Section id="security" labelledBy="security-title">
      <SectionHeader
        id="security-title"
        eyebrow="Security & privacy"
        title="Designed for documents that carry duty, prices and personal data"
      />
      <ul className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {security.map((c, i) => {
          const Icon = icons[i];
          return (
            <li key={c.title} className="bg-surface p-6">
              <Icon aria-hidden className="size-5 text-accent" />
              <h3 className="mt-4 font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
