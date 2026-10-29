"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { copyText } from "@/lib/browser-export";
import { dedupePreservingOriginal } from "@/lib/text";

export function TagChips({ tags, deduplicate = false, withHash = true, emptyMessage = "No tags to show." }: { tags: readonly string[]; deduplicate?: boolean; withHash?: boolean; emptyMessage?: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const values = deduplicate ? dedupePreservingOriginal(tags) : [...tags];
  if (values.length === 0) return <p className="text-sm leading-6 text-muted">{emptyMessage}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((tag, index) => {
        const display = withHash ? tag : tag.replace(/^#/u, "");
        const key = `${tag}:${index}`;
        return (
          <button
            key={key}
            className="group inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-xl border border-border-strong/80 bg-surface-muted px-3 py-1.5 text-left text-xs font-semibold text-foreground shadow-[var(--shadow-xs)] transition hover:border-brand/35 hover:bg-brand-soft hover:text-brand-strong"
            onClick={async () => {
              try {
                await copyText(display);
                setCopied(key);
                window.setTimeout(() => setCopied(null), 1200);
              } catch {
                setCopied(null);
              }
            }}
            title={`Copy ${display}`}
          >
            <span className="break-all">{display}</span>
            {copied === key ? <Check className="size-3 text-success" /> : <Copy className="size-3 text-muted opacity-0 transition group-focus-visible:opacity-100 group-hover:opacity-100" />}
          </button>
        );
      })}
    </div>
  );
}
