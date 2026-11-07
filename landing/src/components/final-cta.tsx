"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { demo, links } from "@/content";
import { ButtonLink, Section } from "./ui";

export function FinalCta() {
  return (
    <Section id="demo" labelledBy="demo-title">
      <div className="rounded-2xl border border-line bg-surface p-6 sm:p-12">
        <h2 id="demo-title" className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {demo.title}
        </h2>
        <p className="mt-4 max-w-2xl text-muted">{demo.body}</p>
        <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-line bg-bg">
            <Credential label="Email" value={demo.email} />
            <Credential label="Password" value={demo.password} />
          </div>
          <ButtonLink href={links.demo} external>
            Try the live demo
          </ButtonLink>
        </div>
        <p className="mt-6 text-sm text-muted">{demo.note}</p>
      </div>
    </Section>
  );
}

function Credential({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the value is still selectable */
    }
  }
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-0">
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
        <p className="text-xs text-muted sm:w-20 sm:shrink-0">{label}</p>
        <p className="mono text-sm break-all text-ink select-all">{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="grid size-9 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
      >
        {copied ? <Check aria-hidden className="size-4 text-clear" /> : <Copy aria-hidden className="size-4" />}
      </button>
    </div>
  );
}
