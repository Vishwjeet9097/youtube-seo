"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { copyText } from "@/lib/browser-export";
import { dedupePreservingOriginal } from "@/lib/text";

export function TagChips({
  tags,
  deduplicate = false,
  withHash = true,
  emptyMessage = "No tags to show.",
}: {
  tags: readonly string[];
  deduplicate?: boolean;
  withHash?: boolean;
  emptyMessage?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const values = deduplicate ? dedupePreservingOriginal(tags) : [...tags];
  if (values.length === 0) return <p className="text-sm leading-6 text-muted">{emptyMessage}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((tag, index) => {
        const display = withHash ? tag : tag.replace(/^#/u, "");
        const key = `${tag}:${index}`;
        const isCopied = copied === key;
        return (
          <button
            key={key}
            className={`group inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-xl border px-3 py-1.5 text-left text-xs font-semibold transition-all shadow-xs active:scale-[0.98] ${
              isCopied
                ? "border-success/60 bg-success-soft text-success shadow-[0_0_12px_rgba(0,245,160,0.3)]"
                : "border-border-strong/70 bg-surface-muted text-foreground hover:border-brand/50 hover:bg-brand-soft hover:text-brand-strong dark:hover:text-brand hover:shadow-[0_0_12px_rgba(6,182,212,0.2)]"
            }`}
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
            {isCopied ? (
              <Check className="size-3 text-success shrink-0" />
            ) : (
              <Copy className="size-3 text-muted/60 opacity-0 transition group-focus-visible:opacity-100 group-hover:opacity-100 shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}
