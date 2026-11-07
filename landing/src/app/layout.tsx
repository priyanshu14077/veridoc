import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Veridoc: AI document extraction and cross-checks for customs brokers",
  description:
    "Invoice, packing list and bill of lading in; one clean Bill of Entry file out. AI does the typing, rules do the checking, a person signs off.",
};

export const viewport: Viewport = { themeColor: "#09090b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
