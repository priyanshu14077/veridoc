import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import "./globals.css";

// The app's own type (IBM Plex Sans and Mono), plus Plex Serif for display headings.
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
// Mono only appears inside the mockups, so it isn't preloaded and doesn't compete with the headline's fonts.
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap", preload: false });
const serif = IBM_Plex_Serif({ subsets: ["latin"], weight: ["400"], variable: "--font-plex-serif", display: "swap" });

export const metadata: Metadata = {
  title: "Veridoc: AI document extraction and cross-checks for customs brokers",
  description:
    "Invoice, packing list and bill of lading in; one clean Bill of Entry file out. AI does the typing, rules do the checking, a person signs off.",
};

export const viewport: Viewport = { themeColor: "#fbfbfa" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
