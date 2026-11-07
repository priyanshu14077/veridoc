"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/app-shell";
import { Button } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Me } from "@/lib/types";

// Public demo accounts (also listed in deployment.md). Not secrets: seed data for reviewers.
const DEMO = [
  { email: "meera.exec@veridoc.demo", label: "Meera Iyer", role: "Executive" },
  { email: "anil.manager@veridoc.demo", label: "Anil Kulkarni", role: "Manager" },
];
const DEMO_PASSWORD = "veridoc-demo";

function safeNext(raw: string | null): string {
  // Only same-site paths, never "//evil.com" or absolute URLs.
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/shipments";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api<Me>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (me) => {
      qc.setQueryData(["me"], me);
      router.replace(safeNext(params.get("next")));
    },
  });

  const error = login.error instanceof ApiError ? login.error.message : null;

  return (
    <div className="w-full max-w-[380px]">
      <div className="mb-8 flex items-center gap-2.5 text-lg font-semibold tracking-tight">
        <Logo className="size-7" /> Veridoc
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-muted">Documentation team access only.</p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate({ email: email.trim(), password });
        }}
      >
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-md bg-conflict-soft px-3 py-2 text-sm text-conflict">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={login.isPending} className="w-full">
          Sign in
        </Button>
      </form>

      <div className="mt-8 rounded-md border border-line bg-surface p-4">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Demo accounts</p>
        <ul className="mt-2 divide-y divide-line">
          {DEMO.map((d) => (
            <li key={d.email}>
              <button
                type="button"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(DEMO_PASSWORD);
                  login.mutate({ email: d.email, password: DEMO_PASSWORD });
                }}
                className="flex w-full items-center justify-between py-2 text-left hover:text-accent"
              >
                <span>
                  <span className="font-medium">{d.label}</span>{" "}
                  <span className="text-muted">· {d.role}</span>
                </span>
                <span className="text-xs text-accent">Use →</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Password <span className="num text-ink-2">{DEMO_PASSWORD}</span>
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink-2">
        {label}
      </label>
      {children}
    </div>
  );
}
