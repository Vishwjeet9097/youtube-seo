"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clipboard, Hash, Save, Search } from "lucide-react";
import { Field, Input, LanguageSelect, RegionSelect, Select } from "@/components/shared/form-fields";
import { TrendTable } from "@/components/research/trend-table";
import { Button, Callout, EmptyState, LoadingState, PageHeader, Panel } from "@/components/shared/ui";
import { postApi } from "@/lib/client-api";
import { copyText } from "@/lib/browser-export";
import { aggregateVideoTerms } from "@/lib/metrics";
import { createActivity, createProject } from "@/lib/storage";
import { updateWorkspace, useWorkspace } from "@/hooks/use-workspace";
import type { ResearchResult } from "@/types/research";

export function HashtagResearchClient() {
  const workspace = useWorkspace();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("US");
  const [language, setLanguage] = useState("en");
  const [days, setDays] = useState("7");
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const defaultsApplied = useRef(false);

  useEffect(() => { const value = new URLSearchParams(window.location.search).get("query"); if (value) setQuery(value); }, []);
  useEffect(() => {
    if (!workspace.hydrated || defaultsApplied.current) return;
    defaultsApplied.current = true;
    const id = new URLSearchParams(window.location.search).get("project");
    const project = workspace.state.projects.find((item) => item.id === id && item.type === "hashtag");
    if (project && isResearchResult(project.payload)) {
      setResult(project.payload); setQuery(project.payload.specification.query); setRegion(project.payload.specification.region); setLanguage(project.payload.specification.language);
      const after = project.payload.specification.publishedAfter;
      if (after) {
        const restoredDays = Math.round((new Date(project.payload.retrievedAt).getTime() - new Date(after).getTime()) / 86_400_000);
        if ([1, 2, 7, 28].includes(restoredDays)) setDays(String(restoredDays));
      }
    } else {
      setRegion(workspace.state.preferences.defaultRegion); setLanguage(workspace.state.preferences.defaultLanguage);
    }
  }, [workspace.hydrated, workspace.state.preferences, workspace.state.projects]);

  const rows = useMemo(() => result ? aggregateVideoTerms(result.videos, "hashtag", "youtube_search", result.region) : [], [result]);
  const titleOnlyCount = result?.videos.reduce((sum, video) => sum + video.hashtags.title.length, 0) ?? 0;
  const descriptionOnlyCount = result?.videos.reduce((sum, video) => sum + video.hashtags.description.length, 0) ?? 0;
  const titleHashtags = result ? [...new Set(result.videos.flatMap((video) => video.hashtags.title))] : [];
  const descriptionHashtags = result ? [...new Set(result.videos.flatMap((video) => video.hashtags.description))] : [];

  const run = async () => {
    if (query.trim().length < 2) { setError("Enter at least 2 characters for the topic."); return; }
    setLoading(true); setError(null);
    try {
      const publishedAfter = new Date(Date.now() - Number(days) * 86_400_000).toISOString();
      const response = await postApi<ResearchResult>("/api/research", { query: query.trim(), region, language, maxResults: 50, includeSuggestions: false, includeGeneratedCandidates: false, publishedAfter });
      setResult(response.data);
      updateWorkspace((state) => ({ ...state, activities: [createActivity("hashtag", query.trim(), response.data.hashtags.length), ...state.activities] }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "We couldn’t load hashtags. Try again."); }
    finally { setLoading(false); }
  };

  const save = () => {
    if (!result) return;
    const saved = updateWorkspace((state) => ({ ...state, projects: [createProject(`Hashtags · ${result.query}`, "hashtag", result), ...state.projects] }));
    flash(saved.ok ? "Saved in this browser." : "Couldn’t save in this browser.");
  };
  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 1800); };
  const copyAll = async (prefix: boolean) => {
    try { await copyText(rows.map((row) => prefix ? `#${row.term.replace(/^#/u, "")}` : row.term.replace(/^#/u, "")).join("\n")); flash(`Copied ${rows.length} hashtags${prefix ? " with #" : " without #"}.`); }
    catch { flash("Couldn’t access the clipboard."); }
  };

  return (
    <div className="page-shell">
      <PageHeader eyebrow="Public video text" title="Hashtag research" description="See hashtags that appear in public video titles and descriptions in recent video samples." actions={result ? <><Button variant="secondary" onClick={() => copyAll(true)} disabled={!rows.length}><Clipboard className="size-4" />Copy with #</Button><Button variant="secondary" onClick={() => copyAll(false)} disabled={!rows.length}>Copy without #</Button><Button variant="secondary" onClick={save}><Save className="size-4" />Save</Button></> : undefined} />
      <Panel><form className="p-5 sm:p-6" onSubmit={(event) => { event.preventDefault(); void run(); }}><div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_180px_180px_180px_auto]"><Field label="Topic"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g., devotional songs" /></Field><Field label="Region"><RegionSelect value={region} onChange={(event) => setRegion(event.target.value)} /></Field><Field label="Language"><LanguageSelect value={language} onChange={(event) => setLanguage(event.target.value)} /></Field><Field label="Published within"><Select value={days} onChange={(event) => setDays(event.target.value)}><option value="1">Last 24 hours</option><option value="2">Last 48 hours</option><option value="7">Last 7 days</option><option value="28">Last 28 days</option></Select></Field><Button type="submit" className="self-end" disabled={loading || query.trim().length < 2}><Search className="size-4" />{loading ? "Loading…" : "Find hashtags"}</Button></div></form></Panel>
      {error ? <Callout className="mt-5" tone="danger" title="Couldn’t load hashtags">{error}</Callout> : null}
      {loading ? <Panel className="mt-6"><LoadingState label="Finding hashtags in public video text" /></Panel> : null}
      {!loading && !result ? <Panel className="mt-6"><EmptyState icon={Hash} title="No hashtag results yet" description="Enter a topic to see hashtags from public video titles and descriptions." /></Panel> : null}
      {!loading && result ? <div className="mt-6 space-y-6"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Videos in sample" value={result.sampleSize} /><Metric label="Unique hashtags" value={rows.length} /><Metric label="Hashtags found in titles" value={titleOnlyCount} /><Metric label="Hashtags found in descriptions" value={descriptionOnlyCount} /></div><Callout tone="info" title="What these counts mean">Title and description totals count every hashtag found in those fields across the {result.sampleSize} videos in sample, including repeats across videos. The table shows how many videos contain each hashtag.</Callout><TrendTable rows={rows} title="Hashtags in sample" exportLabel={`${result.query}-hashtags`} /><Panel><div className="panel-header"><div><h2 className="text-sm font-semibold">Where hashtags appeared</h2><p className="mt-1 text-xs text-muted">Hashtags keep their original spelling and writing system.</p></div></div><div className="grid gap-px bg-border md:grid-cols-2"><div className="bg-surface p-5"><h3 className="text-xs font-bold uppercase tracking-wider text-muted">Video titles</h3><div className="mt-3 flex flex-wrap gap-2">{titleHashtags.length ? titleHashtags.map((tag) => <span className="badge border-brand/25 bg-brand-soft text-brand-strong" key={tag}>{tag}</span>) : <p className="text-xs text-muted">No hashtags were found in video titles.</p>}</div></div><div className="bg-surface p-5"><h3 className="text-xs font-bold uppercase tracking-wider text-muted">Video descriptions</h3><div className="mt-3 flex flex-wrap gap-2">{descriptionHashtags.length ? descriptionHashtags.map((tag) => <span className="badge border-border-strong bg-surface-muted text-muted" key={tag}>{tag}</span>) : <p className="text-xs text-muted">No hashtags were found in video descriptions.</p>}</div></div></div></Panel></div> : null}
      <span className="sr-only" aria-live="polite">{notice}</span>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: number }) { return <div className="metric-card"><p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</p><p className="mt-3 text-[28px] font-bold leading-none tracking-[-0.04em] tabular-nums">{value}</p></div>; }
function isResearchResult(value: unknown): value is ResearchResult { return Boolean(value && typeof value === "object" && "query" in value && "videos" in value && "hashtags" in value); }
