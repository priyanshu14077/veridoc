import { ArrowRight, ArrowUpRight } from "lucide-react";

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
    <section id={id} aria-labelledby={labelledBy} className={`border-t border-line py-20 sm:py-28 ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

export function SectionHeader({
  id,
  eyebrow,
  title,
  intro,
}: {
  id: string;
  eyebrow: string;
  title: string;
  intro?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="mono text-xs uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {intro && <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">{intro}</p>}
    </div>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  external?: boolean;
}) {
  const base =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors";
  const style =
    variant === "primary"
      ? "bg-accent text-accent-ink hover:bg-[#7aa2ff]"
      : "border border-line-strong text-ink hover:border-muted hover:bg-surface-2";
  const Icon = external ? ArrowUpRight : ArrowRight;
  return (
    <a
      href={href}
      className={`${base} ${style}`}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
      <Icon aria-hidden className="size-4" />
      {external && <span className="sr-only">(opens in a new tab)</span>}
    </a>
  );
}

/** Confidence as the app shows it: a percentage, amber below the threshold. */
export function ConfidenceBadge({ value, threshold }: { value: number; threshold: number }) {
  const low = value < threshold;
  return (
    <span
      className={`mono inline-flex items-center rounded px-1.5 py-0.5 text-[11px] ${
        low ? "bg-unsure/15 text-unsure" : "bg-clear/10 text-clear"
      }`}
    >
      {Math.round(value * 100)}%
    </span>
  );
}
