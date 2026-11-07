import { reads } from "@/content";
import { Container } from "./ui";

/** An endless strip of what Veridoc reads, where other pages put customer logos. Pauses on hover. */
export function Marquee() {
  return (
    <section aria-label="What Veridoc reads" className="border-y border-line bg-surface py-5">
      <Container className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
        <p className="shrink-0 text-sm text-muted">Reads, scores and checks</p>
        <ul className="sr-only">
          {reads.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <div aria-hidden className="marquee-wrap relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
          <div className="marquee flex w-max gap-2">
            {[...reads, ...reads].map((r, i) => (
              <span
                key={i}
                className="mono rounded-full border border-line bg-paper px-3 py-1 text-[13px] whitespace-nowrap text-ink-2"
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
