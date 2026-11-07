import { CrossChecks } from "@/components/cross-checks";
import { FinalCta } from "@/components/final-cta";
import { Fits } from "@/components/fits";
import { Flags } from "@/components/flags";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { MotionProvider } from "@/components/motion-provider";
import { Nav } from "@/components/nav";
import { Problem } from "@/components/problem";
import { Security } from "@/components/security";
import { Targets } from "@/components/targets";
import { Team } from "@/components/team";

export default function Home() {
  return (
    <MotionProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-bg"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <Problem />
        <HowItWorks />
        <CrossChecks />
        <Flags />
        <Team />
        <Fits />
        <Security />
        <Targets />
        <FinalCta />
      </main>
      <Footer />
    </MotionProvider>
  );
}
