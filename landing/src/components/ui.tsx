import { ArrowRight, ArrowUpRight, CheckCircle2, CircleDashed, FileUp, Loader2, TriangleAlert } from "lucide-react";
import type { Status, Title } from "@/content";

export function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

export function Section({
  id,
  labelledBy,
  children,
  className = "",
}: {
  id?: string;
  labelledBy: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`py-20 sm:py-28 ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

/** Inline style for the .reveal / .rise stagger: --i is the sibling index, --d a delay in ms. */
export function stagger(i: number, delayMs?: number): React.CSSProperties {
  return { "--i": i, ...(delayMs !== undefined ? { "--d": `${delayMs}ms` } : {}) } as React.CSSProperties;
}

/** The app's mark: two offset sheets with a tick (documents, checked against each other). */
export function Logo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <rect x="3" y="5" width="12" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="2" width="12" height="15" rx="2" fill="var(--color-surface)" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 10l2.2 2.2L18.5 8" fill="none" stroke="var(--color-accent)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
      <Logo />
      Veridoc
    </span>
  );
}

/** Small label above a section heading, with the logo's tick as its marker. */
export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`flex items-center gap-2 text-sm text-muted ${className}`}>
      <svg viewBox="0 0 12 12" aria-hidden className="size-3 text-accent">
        <path d="M2 6.5l2.5 2.5L10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </p>
  );
}

/** Two-tone serif heading. Each line rises on scroll. */
export function TwoTone({
  id,
  title,
  as: Tag = "h2",
  className = "",
}: {
  id: string;
  title: Title;
  as?: "h1" | "h2";
  className?: string;
}) {
  return (
    <Tag id={id} className={`display text-balance ${className}`}>
      <span className="reveal block text-ink" style={stagger(1)}>
        {title[0]}
      </span>{" "}
      <span className="reveal block text-muted" style={stagger(2)}>
        {title[1]}
      </span>
    </Tag>
  );
}

export function SectionHeader({
  id,
  eyebrow,
  title,
  intro,
  center = false,
}: {
  id: string;
  eyebrow: string;
  title: Title;
  intro?: string;
  center?: boolean;
}) {
  return (
    <div className={`max-w-3xl ${center ? "mx-auto text-center [&>p:first-child]:justify-center" : ""}`}>
      <Eyebrow className="reveal">{eyebrow}</Eyebrow>
      <TwoTone id={id} title={title} className="mt-4 text-4xl sm:text-5xl" />
      {intro && (
        <p className={`reveal mt-5 max-w-2xl text-base leading-relaxed text-ink-2 sm:text-lg ${center ? "mx-auto" : ""}`} style={stagger(3)}>
          {intro}
        </p>
      )}
    </div>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  external = false,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  external?: boolean;
  className?: string;
}) {
  const base =
    "group inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-300 ease-smooth active:scale-[0.97]";
  const style = {
    primary: "bg-accent text-accent-ink shadow-[0_1px_0_0_rgb(255_255_255/0.2)_inset,0_6px_16px_-6px_rgb(31_79_209/0.6)] hover:bg-accent-hover",
    secondary: "border border-line-strong bg-surface text-ink hover:border-ink-2",
    ghost: "text-ink hover:bg-info-soft",
  }[variant];
  const Icon = external ? ArrowUpRight : ArrowRight;
  return (
    <a
      href={href}
      className={`${base} ${style} ${className}`}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
      <Icon
        aria-hidden
        className={`size-4 transition-transform duration-300 ease-smooth ${
          external ? "group-hover:-translate-y-0.5 group-hover:translate-x-0.5" : "group-hover:translate-x-1"
        }`}
      />
      {external && <span className="sr-only">(opens in a new tab)</span>}
    </a>
  );
}

// Status chips exactly as the app draws them (web/src/components/status-chip.tsx).
const STATUS = {
  draft: { label: "Draft", cls: "bg-info-soft text-info", Icon: CircleDashed },
  extracting: { label: "Extracting", cls: "bg-accent-soft text-accent", Icon: Loader2 },
  needs_review: { label: "Needs review", cls: "bg-unsure-soft text-unsure", Icon: TriangleAlert },
  cleared: { label: "Cleared", cls: "bg-clear-soft text-clear", Icon: CheckCircle2 },
  exported: { label: "Exported", cls: "bg-info-soft text-ink-2", Icon: FileUp },
} as const;

export function StatusChip({ status, small = false }: { status: Status; small?: boolean }) {
  const m = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap ${m.cls} ${
        small ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-xs"
      }`}
    >
      <m.Icon aria-hidden className={`${small ? "size-3" : "size-3.5"} ${status === "extracting" ? "motion-safe:animate-spin" : ""}`} />
      {m.label}
    </span>
  );
}

export function Kbd({ children, down = false }: { children: React.ReactNode; down?: boolean }) {
  return (
    <kbd
      className={`mono inline-block rounded border px-1 py-px text-[11px] transition-[transform,background-color,border-color,color] duration-150 ${
        down ? "translate-y-px border-accent bg-accent-soft text-accent" : "border-line-strong bg-surface text-ink-2"
      }`}
    >
      {children}
    </kbd>
  );
}

/** A window of the app: white card, app-style top bar. Children are the screen. */
export function AppWindow({
  children,
  title,
  className = "",
}: {
  children: React.ReactNode;
  title?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-line bg-surface text-ink shadow-[0_24px_60px_-20px_rgb(5_8_30/0.65),0_2px_6px_rgb(5_8_30/0.25)] ${className}`}
    >
      <div className="flex h-9 items-center gap-2 border-b border-line bg-surface px-3">
        <span className="flex gap-1">
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="size-2 rounded-full bg-line-strong" />
        </span>
        <span className="ml-1 flex min-w-0 items-center gap-1.5 text-xs font-semibold tracking-tight">
          <Logo className="size-4 shrink-0" />
          {title ?? "Veridoc"}
        </span>
      </div>
      {children}
    </div>
  );
}
