import { Faq } from "@/components/faq";
import { FinalCta } from "@/components/final-cta";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Marquee } from "@/components/marquee";
import { MotionProvider } from "@/components/motion-provider";
import { Nav } from "@/components/nav";
import { Problem } from "@/components/problem";
import { Security } from "@/components/security";
import { Story } from "@/components/story";
import { Targets } from "@/components/targets";
import { Tour } from "@/components/tour";

export default function Home() {
  return (
    <MotionProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-surface"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <Marquee />
        <Problem />
        <HowItWorks />
        <Story />
        <Tour />
        <Security />
        <Targets />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </MotionProvider>
  );
}
