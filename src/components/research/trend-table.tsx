"use client";

import { useMemo, useState } from "react";
import { Clipboard, Download, Search } from "lucide-react";
import { Button, EmptyState } from "@/components/shared/ui";
import { Input, Select } from "@/components/shared/form-fields";
import { SourceBadge, TrendBadge } from "@/components/shared/source-badge";
import { copyText, downloadText } from "@/lib/browser-export";
import { safeFilename, toCsv } from "@/lib/csv";
import { formatDate, formatNumber } from "@/lib/format";
import { normalizeForMatch } from "@/lib/text";
import { createExportEntry } from "@/lib/storage";
import { updateWorkspace } from "@/hooks/use-workspace";
import type { TermAggregate } from "@/types/research";

type TrendSort = "videos" | "channels" | "views" | "growth" | "viewGrowth";

export function TrendTable({ rows, title, exportLabel }: { rows: readonly TermAggregate[]; title: string; exportLabel: string }) {
  const [query, setQuery] = useState("");
  const [minimumVideos, setMinimumVideos] = useState(1);
  const [sort, setSort] = useState<TrendSort>("videos");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const filtered = useMemo(() => rows
    .filter((row) => normalizeForMatch(row.term).includes(normalizeForMatch(query)))
    .filter((row) => row.distinctVideoCount >= minimumVideos)
    .sort((left, right) => {
      if (sort === "channels") return right.distinctChannelCount - left.distinctChannelCount;
      if (sort === "views") return (right.averageViews ?? -1) - (left.averageViews ?? -1);
      if (sort === "growth") return (right.trendChangePercent ?? -Infinity) - (left.trendChangePercent ?? -Infinity);
      if (sort === "viewGrowth") return (right.viewGrowthPercent ?? -Infinity) - (left.viewGrowthPercent ?? -Infinity);
      return right.distinctVideoCount - left.distinctVideoCount;
    }), [rows, query, minimumVideos, sort]);
  const selectedRows = filtered.filter((row) => selected.has(row.normalizedTerm));
  const chosen = selectedRows.length ? selectedRows : filtered;

  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 1800); };
  const exportData = (format: "csv" | "json") => {
    if (!chosen.length) return;
    const filename = safeFilename(exportLabel, format);
    const content = format === "json" ? JSON.stringify(chosen, null, 2) : toCsv(chosen, [
      { header: "Term", value: (row) => row.term },
      { header: "Type", value: (row) => row.kind },
      { header: "Videos in sample", value: (row) => row.distinctVideoCount },
      { header: "Channels in sample", value: (row) => row.distinctChannelCount },
      { header: "Average views", value: (row) => row.averageViews },
      { header: "Median views", value: (row) => row.medianViews },
      { header: "Sample share trend", value: (row) => row.trendStatus },
      { header: "Change in sample share (%)", value: (row) => row.trendChangePercent },
      { header: "View change for same videos (%)", value: (row) => row.viewGrowthPercent },
      { header: "Videos compared for views", value: (row) => row.viewGrowthVideoCount },
      { header: "First publish date", value: (row) => row.firstPublishedAt },
      { header: "Last publish date", value: (row) => row.lastPublishedAt },
      { header: "First sample date", value: (row) => row.firstObservedAt },
      { header: "Latest sample date", value: (row) => row.lastObservedAt },
      { header: "Region", value: (row) => row.region },
      { header: "Total videos in sample", value: (row) => row.sampleSize },
      { header: "Sample source", value: (row) => row.sourceName },
    ]);
    downloadText(content, filename, format === "json" ? "application/json" : "text/csv");
    updateWorkspace((state) => ({ ...state, exportHistory: [createExportEntry(filename, format, chosen.length), ...state.exportHistory] }));
    flash(`Exported ${chosen.length} row${chosen.length === 1 ? "" : "s"}.`);
  };

  return (
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-muted">How often each term appears in the analyzed videos. These counts show how often creators use a term, not how often people search for it.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="small" disabled={!chosen.length} onClick={async () => { try { await copyText(chosen.map((row) => row.kind === "hashtag" ? `#${row.term.replace(/^#/u, "")}` : row.term).join("\n")); flash(`Copied ${chosen.length} row${chosen.length === 1 ? "" : "s"}.`); } catch { flash("Couldn’t access the clipboard."); } }}><Clipboard className="size-3.5" />Copy terms</Button>
          <Button variant="secondary" size="small" disabled={!chosen.length} onClick={() => exportData("csv")}><Download className="size-3.5" />Export CSV</Button>
          <Button variant="secondary" size="small" disabled={!chosen.length} onClick={() => exportData("json")}>Export JSON</Button>
        </div>
      </div>
      <div className="grid gap-2 border-b p-3 sm:grid-cols-[1fr_160px_210px]">
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" /><Input className="pl-9" placeholder="Filter terms" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Filter terms" /></div>
        <Input type="number" min={1} value={minimumVideos} onChange={(event) => setMinimumVideos(Math.max(1, Number(event.target.value)))} aria-label="Minimum videos in sample" title="Minimum videos in sample" />
        <Select value={sort} onChange={(event) => setSort(event.target.value as TrendSort)} aria-label="Sort terms"><option value="videos">Most videos in sample</option><option value="channels">Most channels</option><option value="views">Highest average views</option><option value="growth">Largest change in sample share</option><option value="viewGrowth">Largest view change for matched videos</option></Select>
      </div>
      {!filtered.length ? <EmptyState icon={Search} title="No matching terms" description={rows.length ? "Try changing the filters." : "No terms of this type were found in the videos in sample."} compact /> : (
        <div className="table-wrap"><table className="data-table !min-w-[1250px]"><thead><tr>
          <th className="w-10"><input type="checkbox" aria-label="Select all shown terms" checked={filtered.every((row) => selected.has(row.normalizedTerm))} onChange={(event) => setSelected(event.target.checked ? new Set(filtered.map((row) => row.normalizedTerm)) : new Set())} className="size-4 accent-[var(--brand)]" /></th>
          <th>Term</th><th>Source</th><th>Videos found</th><th>Channels</th><th>Average views</th><th>Median views</th><th>Trend</th><th>View change</th><th>Publish dates</th><th>Date analyzed</th><th>Video links</th>
        </tr></thead><tbody>{filtered.map((row) => <tr key={`${row.kind}:${row.normalizedTerm}`}>
          <td><input type="checkbox" checked={selected.has(row.normalizedTerm)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(row.normalizedTerm)) next.delete(row.normalizedTerm); else next.add(row.normalizedTerm); return next; })} aria-label={`Select ${row.term}`} className="size-4 accent-[var(--brand)]" /></td>
          <td className="max-w-64 font-semibold">{row.kind === "hashtag" ? `#${row.term.replace(/^#/u, "")}` : row.term}</td>
          <td><SourceBadge source={row.sourceType} /><p className="mt-1 text-[10px] text-muted">{row.region ?? "All regions"}</p></td>
          <td className="font-semibold tabular-nums">{row.distinctVideoCount}</td><td className="tabular-nums">{row.distinctChannelCount}</td><td className="tabular-nums">{formatNumber(row.averageViews)}</td><td className="tabular-nums">{formatNumber(row.medianViews)}</td>
          <td><TrendBadge status={row.trendStatus} change={row.trendChangePercent} /><p className="mt-1 max-w-52 text-[10px] leading-4 text-muted">{row.trendExplanation}</p></td>
          <td>{row.viewGrowthPercent === null ? <span className="text-xs text-muted">No comparison</span> : <span className="font-semibold tabular-nums">{row.viewGrowthPercent > 0 ? "+" : ""}{row.viewGrowthPercent}%</span>}<p className="mt-1 max-w-52 text-[10px] leading-4 text-muted">{row.viewGrowthExplanation}</p></td>
          <td className="whitespace-nowrap text-[11px] text-muted">{formatDate(row.firstPublishedAt)}<br />to {formatDate(row.lastPublishedAt)}</td>
          <td className="whitespace-nowrap text-[11px] text-muted">{formatDate(row.firstObservedAt, true)}<br />to {formatDate(row.lastObservedAt, true)}</td>
          <td><details><summary className="cursor-pointer font-semibold text-brand">{row.evidence.length} video link{row.evidence.length === 1 ? "" : "s"}</summary><div className="mt-2 w-52 space-y-1 text-[11px]">{row.evidence.map((item) => item.sourceUrl ? <a key={item.id} href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-brand underline">{item.detail}</a> : <span key={item.id}>{item.detail}</span>)}</div></details></td>
        </tr>)}</tbody></table></div>
      )}
      <div className="border-t px-4 py-3 text-xs text-muted">{filtered.length} term{filtered.length === 1 ? "" : "s"} shown · Sample date {filtered[0] ? formatDate(filtered[0].lastObservedAt, true) : "No sample date"}</div>
      <span className="sr-only" aria-live="polite">{notice}</span>
    </section>
  );
}
