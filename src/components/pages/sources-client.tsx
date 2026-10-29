"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Database, Download, ExternalLink, FileUp, ServerOff, ShieldCheck } from "lucide-react";
import { KeywordTable } from "@/components/research/keyword-table";
import { Badge, Button, Callout, EmptyState, LoadingState, PageHeader, Panel } from "@/components/shared/ui";
import { downloadText } from "@/lib/browser-export";
import { getApi } from "@/lib/client-api";
import { createProject } from "@/lib/storage";
import { parseGoogleTrendsImport, trendsRowsToMetrics } from "@/lib/trends-import";
import { updateWorkspace, useWorkspace } from "@/hooks/use-workspace";
import type { ProviderStatus } from "@/lib/providers/types";
import type { KeywordMetric, ResearchResult } from "@/types/research";

interface StatusData { providers: ProviderStatus[]; storage: { type: string; durableOnServer: boolean; sharedAcrossUsers: boolean; storesSecrets: boolean }; cache: { type: string; durable: boolean; maximumEntries: number } }

export function SourcesClient() {
  const workspace = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<KeywordMetric[]>([]);
  const [importName, setImportName] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getApi<StatusData>("/api/status", controller.signal).then((response) => setStatus(response.data)).catch((error: unknown) => setStatusError(error instanceof Error ? error.message : "Source status is unavailable."));
    return () => controller.abort();
  }, []);

  const importTrends = async (file: File) => {
    try {
      const rows = parseGoogleTrendsImport(await file.text(), file.name);
      setMetrics(trendsRowsToMetrics(rows, file.name)); setImportName(file.name); flash(`Imported ${rows.length} row${rows.length === 1 ? "" : "s"}. Required fields were checked, but the source was not verified.`);
    } catch (error) { flash(error instanceof Error ? error.message : "Could not import the file."); }
    finally { if (inputRef.current) inputRef.current.value = ""; }
  };
  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2600); };
  const saveImport = () => {
    if (!metrics.length) return;
    const now = new Date().toISOString();
    const payload: ResearchResult = { specification: { query: `Google Trends import · ${importName}`, region: metrics[0]?.region ?? "Imported", language: "und", maxResults: Math.min(50, metrics.length || 1), includeSuggestions: false, includeGeneratedCandidates: false, publishedAfter: null }, query: `Google Trends import · ${importName}`, region: metrics[0]?.region ?? "Imported", language: "und", retrievedAt: now, sampleSize: 0, videos: [], suggestions: [], titleKeywords: [], tags: [], hashtags: [], relatedQueries: metrics, providerMetrics: [], generatedCandidates: [], warnings: ["This Google Trends data came from an imported file. Required fields were checked, but the source was not verified. Values are relative interest, not search volume."] };
    const saved = updateWorkspace((state) => ({ ...state, projects: [createProject(`Google Trends · ${importName}`, "research", payload), ...state.projects] }));
    flash(saved.ok ? "Saved the import in this browser profile." : saved.error ?? "Could not save the import.");
  };
  const template = "keyword,trendIndex,observedAt,region,timeframe,searchProperty\r\nexample topic,73,2026-10-27T00:00:00.000Z,US,past 7 days,YouTube Search\r\n";

  const latestSnapshot = workspace.state.trendSnapshots[0];
  return (
    <div className="page-shell">
      <PageHeader eyebrow="Data transparency" title="Sources and methods" description="See where results come from, what each metric means, and the limits to keep in mind." actions={<a className="button-secondary" href="https://developers.google.com/youtube/v3/docs" target="_blank" rel="noopener noreferrer">YouTube API documentation<ExternalLink className="size-4" /></a>} />
      {statusError ? <Callout tone="danger" title="Couldn’t load source status">{statusError}</Callout> : null}
      {!status && !statusError ? <Panel><LoadingState label="Checking source availability" /></Panel> : null}
      {status ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{status.providers.map((provider) => <Panel className="p-5" key={provider.id}><div className="flex items-start justify-between gap-3"><span className={`grid size-9 place-items-center rounded-lg ${provider.live ? "bg-success-soft text-success" : "bg-surface-muted text-muted"}`}>{provider.live ? <CheckCircle2 className="size-4" /> : <ServerOff className="size-4" />}</span><Badge tone={provider.live ? "success" : provider.configured ? "warning" : "neutral"}>{provider.live ? "Available" : provider.configured ? "File import only" : "Not connected"}</Badge></div><h2 className="mt-4 text-sm font-semibold">{provider.name}</h2><ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-5 text-muted">{provider.supplies.map((item) => <li key={item}>{item}</li>)}</ul><p className="mt-4 border-t pt-3 text-[11px] leading-5 text-muted">{provider.limitation}</p></Panel>)}</div> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <Panel><div className="panel-header"><div><h2 className="text-sm font-semibold">What the metrics mean</h2><p className="mt-1 text-xs text-muted">Each metric measures something different.</p></div><ShieldCheck className="size-4 text-brand" /></div><div className="divide-y">{[
          ["Provider-reported search volume", "A search estimate from a named keyword provider, using that provider’s stated time period and method. It is unavailable when no provider is connected."],
          ["Google Trends relative interest", "A score from 0 to 100 within the imported comparison, region, search type, and time range. It shows relative interest, not a number of searches."],
          ["Autocomplete suggestion", "A phrase shown for the exact query and locale when it was retrieved. Its presence or position does not prove search volume."],
          ["Appearances in video sample", "The number of sampled videos where a term appears. Public tags and hashtags come from video metadata; title words and phrases come from video titles. This is not a number of searches."],
          ["Views and engagement", "Public counts available when video metadata was retrieved. Missing values are shown as unavailable, and views are not treated as search demand."],
          ["Change between snapshots", "The percentage change in the share of sampled videos containing a term between two snapshots with the same comparison settings. Changes from −5% through +5% are Stable; above +5% is Rising; below −5% is Falling."],
        ].map(([name, description]) => <div key={name} className="px-5 py-4"><h3 className="text-sm font-semibold">{name}</h3><p className="mt-1 text-xs leading-5 text-muted">{description}</p></div>)}</div></Panel>
        <div className="space-y-6"><Panel><div className="panel-header"><div><h2 className="text-sm font-semibold">Saved in this browser profile</h2><p className="mt-1 text-xs text-muted">This history is stored only in this browser profile and is not shared.</p></div></div><dl className="grid grid-cols-2 gap-px bg-border"><div className="bg-surface p-4"><dt className="text-xs text-muted">Trend snapshots</dt><dd className="mt-1 text-xl font-bold">{workspace.state.trendSnapshots.length}</dd></div><div className="bg-surface p-4"><dt className="text-xs text-muted">Saved projects</dt><dd className="mt-1 text-xl font-bold">{workspace.state.projects.length}</dd></div><div className="col-span-2 bg-surface p-4"><dt className="text-xs text-muted">Latest trend snapshot</dt><dd className="mt-1 text-sm font-semibold">{latestSnapshot ? `${latestSnapshot.result.sampleSize} videos · ${new Date(latestSnapshot.result.retrievedAt).toLocaleString()}` : "No trend snapshot saved yet"}</dd></div></dl></Panel><Callout tone="warning" title="Usage limits and result freshness">YouTube limits how many API requests the app can make. Different request types use different amounts of quota, and Google may change those costs. Cached results keep their original retrieval time and are cleared when the server restarts.</Callout></div>
      </div>

      <Panel className="mt-6"><div className="panel-header"><div><h2 className="text-sm font-semibold">Import Google Trends data</h2><p className="mt-1 text-xs text-muted">Add relative-interest data from a CSV or JSON file.</p></div><div className="flex gap-2"><input ref={inputRef} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importTrends(file); }} /><Button variant="secondary" size="small" onClick={() => downloadText(template, "google-trends-import-template.csv", "text/csv")}><Download className="size-3.5" />Download template</Button><Button size="small" onClick={() => inputRef.current?.click()}><FileUp className="size-3.5" />Import file</Button>{metrics.length ? <Button variant="secondary" size="small" onClick={saveImport}>Save in this browser</Button> : null}</div></div><div className="p-5"><ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-muted"><li>In Google Trends, choose a region, time range, and search type, then export or copy data you are allowed to use.</li><li>Put the data in a CSV or JSON file with these fields: <code>keyword</code>, <code>trendIndex</code>, <code>observedAt</code>, <code>region</code>, <code>timeframe</code>, and <code>searchProperty</code>.</li><li>Choose the file here. The app checks the required fields but cannot verify the file’s source. Values remain relative interest, not search volume.</li></ol></div>{metrics.length ? <div className="border-t p-4"><KeywordTable rows={metrics} title={`Imported relative interest · ${importName}`} description="Rows imported from this file." exportLabel="google-trends-import" /></div> : <div className="border-t"><EmptyState icon={Database} title="No Google Trends data imported" description="Download the template, add relative-interest data, then choose a CSV or JSON file." compact /></div>}</Panel>

      <Panel className="mt-6"><div className="panel-header"><div><h2 className="text-sm font-semibold">How to interpret results</h2><p className="mt-1 text-xs text-muted">Important limits to keep in mind.</p></div></div><div className="grid gap-px bg-border md:grid-cols-2"><div className="bg-surface p-5"><h3 className="text-sm font-semibold">Missing public tags</h3><p className="mt-2 text-xs leading-5 text-muted">A video may have no public tags because the uploader did not add any, or because the video is private, deleted, age- or region-restricted, or otherwise unavailable. If an accessible video has an empty tag list, it is shown as “No public tags returned.” Tags are never guessed from titles.</p></div><div className="bg-surface p-5"><h3 className="text-sm font-semibold">Unavailable search volume</h3><p className="mt-2 text-xs leading-5 text-muted">The public YouTube Data API does not provide exact monthly search counts for arbitrary keywords. Without a connected keyword-volume provider, volume and competition are unavailable—not zero.</p></div><div className="bg-surface p-5"><h3 className="text-sm font-semibold">Current charts and time ranges</h3><p className="mt-2 text-xs leading-5 text-muted">The selected time range filters discovered videos by their actual publication dates. A current sample cannot recreate every chart or search result that appeared throughout that period.</p></div><div className="bg-surface p-5"><h3 className="text-sm font-semibold">History in this browser profile</h3><p className="mt-2 text-xs leading-5 text-muted">Comparable snapshots saved in this browser profile can show changes in the share of sampled videos containing a term. This is not server-backed history or a trend index shared across users.</p></div></div></Panel>
      <span className="sr-only" aria-live="polite">{notice}</span>
    </div>
  );
}
