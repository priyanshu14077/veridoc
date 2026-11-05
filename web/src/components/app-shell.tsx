"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense } from "react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me"), staleTime: 300_000 });
}

const NAV = [
  { href: "/shipments", label: "Shipments", managerOnly: false },
  { href: "/overrides", label: "Overrides", managerOnly: true },
  { href: "/accuracy", label: "Accuracy", managerOnly: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSettled: () => {
      qc.clear();
      router.replace("/login");
    },
  });

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link href="/shipments" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo />
            <span className={clsx(me.data?.role === "manager" && "hidden sm:inline")}>
              Crosscheck
            </span>
          </Link>
          <Suspense fallback={<NavLinks pathname="" />}>
            <Nav />
          </Suspense>
          <div className="ml-auto flex items-center gap-3">
            {me.data ? (
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-sm font-medium">{me.data.name}</div>
                <div className="text-xs text-muted capitalize">{me.data.role}</div>
              </div>
            ) : (
              <div className="skeleton hidden h-8 w-28 sm:block" />
            )}
            <button
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="inline-flex size-9 items-center justify-center rounded-md text-ink-2 hover:bg-info-soft hover:text-ink"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  // Two offset sheets with a tick: documents, checked against each other.
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={clsx("size-6", className)}>
      <rect x="3" y="5" width="12" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="2" width="12" height="15" rx="2" fill="var(--color-surface)" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 10l2.2 2.2L18.5 8" fill="none" stroke="var(--color-accent)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// usePathname() reads request data, so it must sit under <Suspense> (Cache Components).
function Nav() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string }) {
  const me = useMe();
  const links = NAV.filter((n) => !n.managerOnly || me.data?.role === "manager");
  return (
    <nav className="flex items-center gap-1" aria-label="Main">
      {links.map((n) => {
        const active = pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "rounded-md px-2.5 py-1.5 text-sm",
              active ? "bg-info-soft font-medium text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
