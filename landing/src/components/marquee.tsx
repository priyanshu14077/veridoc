import { reads } from "@/content";
import { SectionBackdrop } from "./backdrop";
import { Container } from "./primitives";

/** An endless strip of what Veridoc reads, where other pages put customer logos. Pauses on hover. */
export function Marquee() {
  return (
    <section aria-label="What Veridoc reads" className="relative isolate overflow-hidden border-y border-white/10 py-6">
      <SectionBackdrop image="velvex" position="50% 78%" wash="dark" />
      <Container className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
        <p className="shrink-0 text-sm text-white/80">Reads, scores and checks</p>
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
                className="mono rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[13px] whitespace-nowrap text-white/90"
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
