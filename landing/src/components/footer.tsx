import { links } from "@/content";
import { Wordmark } from "./nav";
import { Container } from "./ui";

const docs = [
  { href: links.prd, label: "Product requirements" },
  { href: links.tdd, label: "Technical design" },
  { href: links.deployment, label: "Deployment" },
  { href: links.observability, label: "Observability" },
];

export function Footer() {
  return (
    <footer className="border-t border-line py-12">
      <Container className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-sm text-sm text-muted">All people and companies in the demo are fictional.</p>
        </div>
        <nav aria-label="Documentation" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:grid-cols-3">
          <a href={links.repo} className="text-ink-2 hover:text-ink">GitHub</a>
          {docs.map((d) => (
            <a key={d.href} href={d.href} className="text-muted hover:text-ink">
              {d.label}
            </a>
          ))}
        </nav>
      </Container>
    </footer>
  );
}
