"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clipboard, Download, Filter, Search, Star } from "lucide-react";
import { Button, Callout, EmptyState } from "@/components/shared/ui";
import { Input, Select } from "@/components/shared/form-fields";
import { SourceBadge, TrendBadge } from "@/components/shared/source-badge";
import { copyText, downloadText } from "@/lib/browser-export";
import { safeFilename, toCsv } from "@/lib/csv";
import { formatDate, formatNumber } from "@/lib/format";
import { normalizeForMatch } from "@/lib/text";
import { createExportEntry } from "@/lib/storage";
import { updateWorkspace, useWorkspace } from "@/hooks/use-workspace";
import type { KeywordMetric, SourceType, TrendStatus } from "@/types/research";

const PAGE_SIZE = 15;
const SOURCE_LABELS: Record<SourceType, string> = {
  youtube_video: "Video details",
  youtube_search: "Videos in sample",
  youtube_suggestion: "YouTube autocomplete",
  youtube_popular: "Popular videos",
  google_trends: "Google Trends",
  keyword_provider: "Reported search volume",
  local_calculation: "Calculated from sample",
  generated_candidate: "Generated variant",
};
type SortKey = "prevalence" | "demand" | "trend" | "competition" | "recent" | "alphabetical";
type RankingMode = "observed" | "demand";

export function KeywordTable({
  rows,
  title,
  description,
  exportLabel,
  emptyMessage = "Run topic research to see results in this category.",
}: {
  rows: readonly KeywordMetric[];
  title: string;
  description: string;
  exportLabel: string;
  emptyMessage?: string;
}) {
  const workspace = useWorkspace();
  const [query, setQuery] = useState("");
  const [exact, setExact] = useState(false);
  const [source, setSource] = useState<SourceType | "all">("all");
  const [region, setRegion] = useState("all");
  const [language, setLanguage] = useState("all");
  const [trend, setTrend] = useState<TrendStatus | "all">("all");
  const [minimumEvidence, setMinimumEvidence] = useState(0);
  const [minimumVolume, setMinimumVolume] = useState("");
  const [maximumVolume, setMaximumVolume] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sort, setSort] = useState<SortKey>("prevalence");
  const [rankingMode, setRankingMode] = useState<RankingMode>("observed");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);

  const sources = useMemo(() => [...new Set(rows.map((row) => row.sourceType))], [rows]);
  const regions = useMemo(() => [...new Set(rows.map((row) => row.region).filter((value): value is string => Boolean(value)))], [rows]);
  const languages = useMemo(() => [...new Set(rows.map((row) => row.language).filter((value): value is string => Boolean(value)))], [rows]);

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeForMatch(query);
    const minVolume = minimumVolume === "" ? null : Number(minimumVolume);
    const maxVolume = maximumVolume === "" ? null : Number(maximumVolume);
    const start = startDate ? new Date(`${startDate}T00:00:00.000Z`).getTime() : null;
    const end = endDate ? new Date(`${endDate}T23:59:59.999Z`).getTime() : null;
    return rows
      .filter((row) => rankingMode === "observed" || row.searchVolume !== null)
      .filter((row) => {
        const keyword = normalizeForMatch(row.keyword);
        return !normalizedQuery || (exact ? keyword === normalizedQuery : keyword.includes(normalizedQuery));
      })
      .filter((row) => source === "all" || row.sourceType === source)
      .filter((row) => region === "all" || row.region === region)
      .filter((row) => language === "all" || row.language === language)
      .filter((row) => trend === "all" || row.trendStatus === trend)
      .filter((row) => row.evidenceCount >= minimumEvidence)
      .filter((row) => minVolume === null || (row.searchVolume !== null && row.searchVolume >= minVolume))
      .filter((row) => maxVolume === null || (row.searchVolume !== null && row.searchVolume <= maxVolume))
      .filter((row) => {
        const timestamp = new Date(row.observedAt).getTime();
        return (start === null || timestamp >= start) && (end === null || timestamp <= end);
      })
      .sort((left, right) => compareRows(left, right, sort));
  }, [rows, rankingMode, query, exact, source, region, language, trend, minimumEvidence, minimumVolume, maximumVolume, startDate, endDate, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [query, exact, source, region, language, trend, minimumEvidence, minimumVolume, maximumVolume, startDate, endDate, sort, rankingMode]);
  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount]);

  const selectedRows = filtered.filter((row) => selected.has(rowKey(row)));
  const exportRows = selectedRows.length > 0 ? selectedRows : filtered;
  const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.has(rowKey(row)));

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2200);
  };

  const exportData = (format: "csv" | "json") => {
    if (exportRows.length === 0) return;
    const filename = safeFilename(exportLabel, format);
    const content = format === "json"
      ? JSON.stringify(exportRows, null, 2)
      : toCsv(exportRows, [
          { header: "Keyword", value: (row) => row.keyword },
          { header: "Source", value: (row) => row.sourceName },
          { header: "Source type", value: (row) => row.sourceType },
          { header: "Region", value: (row) => row.region },
          { header: "Language", value: (row) => row.language },
          { header: "Search volume", value: (row) => row.searchVolume },
          { header: "Volume period", value: (row) => row.volumePeriod },
          { header: "Volume type", value: (row) => row.volumeType },
          { header: "Trend index", value: (row) => row.trendIndex },
          { header: "Trend change percent", value: (row) => row.trendChangePercent },
          { header: "Competition", value: (row) => row.competitionScore },
          { header: "Evidence count", value: (row) => row.evidenceCount },
          { header: "Sample video count", value: (row) => row.videoCount },
          { header: "Average views", value: (row) => row.averageViews },
          { header: "Median views", value: (row) => row.medianViews },
          { header: "Observed at", value: (row) => row.observedAt },
        ]);
    downloadText(content, filename, format === "json" ? "application/json" : "text/csv");
    updateWorkspace((state) => ({ ...state, exportHistory: [createExportEntry(filename, format, exportRows.length), ...state.exportHistory] }));
    notify(`Exported ${exportRows.length} row${exportRows.length === 1 ? "" : "s"} to ${format.toUpperCase()}.`);
  };

  const copySelection = async () => {
    if (exportRows.length === 0) return;
    try {
      await copyText(exportRows.map((row) => row.keyword).join("\n"));
      notify(`Copied ${exportRows.length} keyword${exportRows.length === 1 ? "" : "s"}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Couldn’t copy keywords. Try again.");
    }
  };

  return (
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
          <p className="mt-1 text-[11px] leading-4 text-muted">Selected rows are used for copy and export; otherwise, all filtered rows are used.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="small" onClick={copySelection} disabled={exportRows.length === 0}><Clipboard className="size-3.5" />Copy keywords</Button>
          <Button variant="secondary" size="small" onClick={() => exportData("csv")} disabled={exportRows.length === 0}><Download className="size-3.5" />Export CSV</Button>
          <Button variant="secondary" size="small" onClick={() => exportData("json")} disabled={exportRows.length === 0}>Export JSON</Button>
        </div>
      </div>

      <div className="border-b bg-surface px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search keywords" className="pl-9" aria-label="Search keywords" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select value={rankingMode} onChange={(event) => setRankingMode(event.target.value as RankingMode)} aria-label="Rank results by" className="sm:w-48">
              <option value="observed">Appearances in videos</option>
              <option value="demand">Estimated search volume</option>
            </Select>
            <Select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Sort results by" className="sm:w-52">
              <option value="prevalence">Most video appearances</option>
              <option value="demand">Highest estimated volume</option>
              <option value="trend">Largest trend increase</option>
              <option value="competition">Lowest competition</option>
              <option value="recent">Most recently recorded</option>
              <option value="alphabetical">Keyword A–Z</option>
            </Select>
          </div>
        </div>
        <details className="mt-3 group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-muted hover:text-foreground"><Filter className="size-3.5" />Additional filters</summary>
          <div className="mt-3 grid gap-3 rounded-lg border bg-surface-muted p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <label className="text-xs text-muted"><span className="mb-1 block">Source type</span><Select value={source} onChange={(event) => setSource(event.target.value as SourceType | "all")}><option value="all">All source types</option>{sources.map((value) => <option key={value} value={value}>{SOURCE_LABELS[value]}</option>)}</Select></label>
            <label className="text-xs text-muted"><span className="mb-1 block">Region</span><Select value={region} onChange={(event) => setRegion(event.target.value)}><option value="all">All regions</option>{regions.map((value) => <option key={value}>{value}</option>)}</Select></label>
            <label className="text-xs text-muted"><span className="mb-1 block">Language</span><Select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="all">All languages</option>{languages.map((value) => <option key={value}>{value}</option>)}</Select></label>
            <label className="text-xs text-muted"><span className="mb-1 block">Trend</span><Select value={trend} onChange={(event) => setTrend(event.target.value as TrendStatus | "all")}><option value="all">All trends</option><option value="rising">Rising</option><option value="stable">Stable</option><option value="falling">Falling</option><option value="new_observation">No comparison yet</option><option value="unavailable">Not available</option></Select></label>
            <label className="text-xs text-muted"><span className="mb-1 block">Minimum source matches</span><Input type="number" min={0} value={minimumEvidence} onChange={(event) => setMinimumEvidence(Math.max(0, Number(event.target.value)))} /></label>
            <label className="flex items-end gap-2 pb-2 text-xs font-medium text-muted"><input type="checkbox" checked={exact} onChange={(event) => setExact(event.target.checked)} className="size-4 accent-[var(--brand)]" />Exact match</label>
            <label className="text-xs text-muted"><span className="mb-1 block">Minimum estimated volume</span><Input type="number" min={0} value={minimumVolume} onChange={(event) => setMinimumVolume(event.target.value)} placeholder="No minimum" /></label>
            <label className="text-xs text-muted"><span className="mb-1 block">Maximum estimated volume</span><Input type="number" min={0} value={maximumVolume} onChange={(event) => setMaximumVolume(event.target.value)} placeholder="No maximum" /></label>
            <label className="text-xs text-muted"><span className="mb-1 block">Recorded after</span><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label className="text-xs text-muted"><span className="mb-1 block">Recorded before</span><Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          </div>
        </details>
      </div>

      {rankingMode === "demand" && rows.length > 0 && !rows.some((row) => row.searchVolume !== null) ? (
        <div className="p-4"><Callout tone="warning" title="No estimated search volume">No keyword data provider is connected. Switch to Appearances in videos to review these results.</Callout></div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matching results" description={rows.length === 0 ? emptyMessage : "No results match these filters. Clear a filter or choose another ranking."} compact />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr>
                <th className="w-10"><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected((current) => {
                  const next = new Set(current);
                  for (const row of visible) {
                    if (allVisibleSelected) next.delete(rowKey(row));
                    else next.add(rowKey(row));
                  }
                  return next;
                })} aria-label="Select rows on this page" className="size-4 accent-[var(--brand)]" /></th>
                <th>Keyword</th><th>Source</th><th>Search volume (est.)</th><th>Trend</th><th>Competition</th><th>Source details</th><th>Videos found</th><th>Average views</th><th>Date recorded</th>
              </tr></thead>
              <tbody>{visible.map((row) => {
                const key = rowKey(row);
                const favorite = workspace.state.favoriteKeywords.some((value) => normalizeForMatch(value) === normalizeForMatch(row.keyword));
                return <tr key={key}>
                  <td><input type="checkbox" checked={selected.has(key)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} aria-label={`Select ${row.keyword}`} className="size-4 accent-[var(--brand)]" /></td>
                  <td className="max-w-64"><div className="flex items-start gap-2"><button className={`mt-0.5 shrink-0 ${favorite ? "text-warning" : "text-subtle hover:text-warning"}`} onClick={() => updateWorkspace((state) => ({ ...state, favoriteKeywords: favorite ? state.favoriteKeywords.filter((value) => normalizeForMatch(value) !== normalizeForMatch(row.keyword)) : [row.keyword, ...state.favoriteKeywords] }))} aria-label={favorite ? `Unfavorite ${row.keyword}` : `Favorite ${row.keyword}`}><Star className={`size-3.5 ${favorite ? "fill-current" : ""}`} /></button><span className="break-words font-semibold text-foreground">{row.keyword}</span></div></td>
                  <td><SourceBadge source={row.sourceType} /><p className="mt-1 max-w-44 text-[10px] leading-4 text-muted">{row.sourceName}</p></td>
                  <td><Metric value={row.searchVolume} />{row.volumePeriod ? <p className="text-[10px] text-muted">{row.volumePeriod}</p> : null}</td>
                  <td><TrendBadge status={row.trendStatus} change={row.trendChangePercent} />{row.trendIndex !== null ? <p className="mt-1 text-[10px] text-muted">Trend index {row.trendIndex}/100</p> : null}</td>
                  <td><Metric value={row.competitionScore} /></td>
                  <td><details><summary className="cursor-pointer font-semibold text-brand hover:text-brand-bright transition-colors">{row.evidenceCount}</summary><div className="mt-2 w-64 space-y-2 text-[11px] leading-4 text-muted">{row.provenance.map((item, index) => <p key={`${item.metric}:${index}`}><strong className="text-foreground">{item.metric}:</strong> {item.methodology}</p>)}{row.evidence.slice(0, 5).map((item) => <p key={item.id}>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-bright font-semibold no-underline">Open video</a> : item.sourceName} — {item.detail}</p>)}</div></details></td>
                  <td><Metric value={row.videoCount} /></td>
                  <td><Metric value={row.averageViews} /></td>
                  <td className="whitespace-nowrap text-xs text-muted">{formatDate(row.observedAt, true)}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t px-4 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>{filtered.length} result{filtered.length === 1 ? "" : "s"}{selectedRows.length ? ` · ${selectedRows.length} selected` : ""}</p>
            <div className="flex items-center gap-2"><Button variant="secondary" size="small" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}><ChevronLeft className="size-3.5" />Previous</Button><span>Page {page} of {pageCount}</span><Button variant="secondary" size="small" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount}>Next<ChevronRight className="size-3.5" /></Button></div>
          </div>
        </>
      )}
      <p className="sr-only" aria-live="polite">{notice}</p>
    </section>
  );
}

function Metric({ value }: { value: number | null }) {
  return value === null ? <span className="text-xs text-muted" title="No source reported this value">Not available</span> : <span className="font-semibold tabular-nums">{formatNumber(value)}</span>;
}

function rowKey(row: KeywordMetric): string {
  return `${row.sourceType}:${normalizeForMatch(row.keyword)}:${row.observedAt}`;
}

function compareRows(left: KeywordMetric, right: KeywordMetric, sort: SortKey): number {
  if (sort === "alphabetical") return left.keyword.localeCompare(right.keyword);
  if (sort === "recent") return right.observedAt.localeCompare(left.observedAt);
  if (sort === "demand") return compareNullableDescending(left.searchVolume, right.searchVolume);
  if (sort === "trend") return compareNullableDescending(left.trendChangePercent, right.trendChangePercent);
  if (sort === "competition") return compareNullableAscending(left.competitionScore, right.competitionScore);
  return compareNullableDescending(left.videoCount ?? left.evidenceCount, right.videoCount ?? right.evidenceCount);
}

function compareNullableDescending(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function compareNullableAscending(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}
