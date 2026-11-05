import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/app-shell";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo className="size-8" />
      <h1 className="mt-4 text-lg font-semibold tracking-tight">There&apos;s no page here</h1>
      <p className="mt-1 max-w-sm text-muted">The link may be mistyped or out of date.</p>
      <Link href="/shipments" className="mt-5 text-accent hover:underline">
        Go to shipments
      </Link>
    </main>
  );
}
