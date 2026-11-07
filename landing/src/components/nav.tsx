import { links, nav } from "@/content";
import { ButtonLink, Container } from "./ui";

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <span aria-hidden className="grid size-6 place-items-center rounded-md bg-ink text-[13px] font-bold text-bg">
        V
      </span>
      Veridoc
    </span>
  );
}

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/80 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-4">
        <a href="#main">
          <Wordmark />
        </a>
        <nav aria-label="Sections" className="hidden md:block">
          <ul className="flex items-center gap-7 text-sm text-muted">
            {nav.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="transition-colors hover:text-ink">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <ButtonLink href={links.demo} external>
          <span className="hidden sm:inline">Try the live demo</span>
          <span className="sm:hidden">Live demo</span>
        </ButtonLink>
      </Container>
    </header>
  );
}
