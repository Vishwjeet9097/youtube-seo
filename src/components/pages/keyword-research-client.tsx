"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, FlaskConical, Save, Search, Video } from "lucide-react";
import { Field, Input, LanguageSelect, RegionSelect, Select } from "@/components/shared/form-fields";
import { KeywordTable } from "@/components/research/keyword-table";
import { Badge, Button, Callout, EmptyState, LoadingState, PageHeader, Panel } from "@/components/shared/ui";
import { postApi } from "@/lib/client-api";
import { findObservedVariations } from "@/lib/text";
import { createActivity, createProject } from "@/lib/storage";
import { updateWorkspace, useWorkspace } from "@/hooks/use-workspace";
import type { KeywordMetric, ResearchResult } from "@/types/research";

type Category = "all" | "suggestions" | "titles" | "tags" | "hashtags" | "related" | "provider" | "generated";

const CATEGORY_LABELS: Record<Category, string> = {
  all: "All results", suggestions: "Autocomplete", titles: "Title words", tags: "Public tags",
  hashtags: "Hashtags", related: "Related queries", provider: "Reported search volume", generated: "Generated variants",
};

export function KeywordResearchClient() {
  const workspace = useWorkspace();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("US");
  const [language, setLanguage] = useState("en");
  const [dateRange, setDateRange] = useState("any");
  const [maxResults, setMaxResults] = useState(25);
  const [includeSuggestions, setIncludeSuggestions] = useState(true);
  const [experimental, setExperimental] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const defaultsApplied = useRef(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("query");
    if (value) setQuery(value);
  }, []);
  useEffect(() => {
    if (!workspace.hydrated || defaultsApplied.current) return;
    defaultsApplied.current = true;
    const id = new URLSearchParams(window.location.search).get("project");
    const project = workspace.state.projects.find((item) => item.id === id && item.type === "research");
    if (project && isResearchResult(project.payload)) {
      const specification = project.payload.specification;
      setResult(project.payload);
      setQuery(specification.query);
      setRegion(specification.region);
      setLanguage(specification.language);
      setMaxResults(specification.maxResults);
      setIncludeSuggestions(specification.includeSuggestions);
      setExperimental(specification.includeGeneratedCandidates);
      setDateRange(rangePreset(specification.publishedAfter, project.payload.retrievedAt));
    } else {
      setRegion(workspace.state.preferences.defaultRegion);
      setLanguage(workspace.state.preferences.defaultLanguage);
      setIncludeSuggestions(workspace.state.preferences.suggestionsEnabled);
    }
  }, [workspace.hydrated, workspace.state.preferences, workspace.state.projects]);

  const rows = useMemo(() => result ? rowsForCategory(result, category) : [], [result, category]);
  const variations = useMemo(() => result ? findObservedVariations(result.query, result.videos) : new Map<string, string[]>(), [result]);

  const run = async () => {
    if (query.trim().length < 2) { setError("Enter a topic with at least two characters."); return; }
    setLoading(true); setError(null);
    try {
      const publishedAfter = dateRange === "any" ? undefined : new Date(Date.now() - Number(dateRange) * 86_400_000).toISOString();
      const response = await postApi<ResearchResult>("/api/research", {
        query: query.trim(), region, language, maxResults, includeSuggestions,
        includeGeneratedCandidates: experimental, ...(publishedAfter ? { publishedAfter } : {}),
      });
      setResult(response.data);
      const total = response.data.suggestions.length + response.data.titleKeywords.length + response.data.tags.length + response.data.hashtags.length;
      updateWorkspace((state) => ({ ...state, activities: [createActivity("research", query.trim(), total), ...state.activities] }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "We couldn’t research this topic. Try again."); }
    finally { setLoading(false); }
  };

  const save = () => {
    if (!result) return;
    const project = createProject(`Topic · ${result.query}`, "research", result);
    const saved = updateWorkspace((state) => ({ ...state, projects: [project, ...state.projects] }));
    setNotice(saved.ok ? "Saved in this browser." : saved.error ?? "We couldn’t save this research. Try again."); window.setTimeout(() => setNotice(""), 1800);
  };

  return (
    <div className="page-shell">
      <PageHeader eyebrow="Clear source comparisons" title="Topic research" description="Compare suggestions, title words, public tags, hashtags, related queries, and search-volume estimates by source." actions={result ? <Button variant="secondary" onClick={save}><Save className="size-4" />Save research</Button> : undefined} />
      <Panel>
        <form className="p-5 sm:p-6" onSubmit={(event) => { event.preventDefault(); void run(); }}>
          <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_170px_170px_170px_130px]">
            <Field label="Topic"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Chhath Puja songs" autoComplete="off" /></Field>
            <Field label="Region"><RegionSelect value={region} onChange={(event) => setRegion(event.target.value)} /></Field>
            <Field label="Language"><LanguageSelect value={language} onChange={(event) => setLanguage(event.target.value)} /></Field>
            <Field label="Published within"><Select value={dateRange} onChange={(event) => setDateRange(event.target.value)}><option value="any">Any date</option><option value="1">Last 24 hours</option><option value="2">Last 48 hours</option><option value="7">Last 7 days</option><option value="28">Last 28 days</option></Select></Field>
            <Field label="Videos in sample"><Select value={maxResults} onChange={(event) => setMaxResults(Number(event.target.value))}><option value={10}>10 videos</option><option value={25}>25 videos</option><option value={50}>50 videos</option></Select></Field>
          </div>
          <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={includeSuggestions} onChange={(event) => setIncludeSuggestions(event.target.checked)} className="size-4 accent-[var(--brand)]" />Include YouTube autocomplete</label>
            <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={experimental} onChange={(event) => setExperimental(event.target.checked)} className="size-4 accent-[var(--brand)]" />Include generated variants (not observed)</label>
            <Button type="submit" className="sm:ml-auto" disabled={loading || query.trim().length < 2}><Search className={`size-4 ${loading ? "animate-pulse" : ""}`} />{loading ? "Researching" : "Research topic"}</Button>
          </div>
        </form>
      </Panel>

      {error ? <Callout className="mt-5" tone="danger" title="Couldn’t research topic">{error}</Callout> : null}
      {loading ? <Panel className="mt-6"><LoadingState label="Finding videos and organizing results by source" /></Panel> : null}
      {!loading && !result ? <Panel className="mt-6"><EmptyState icon={Search} title="Start with a topic" description="Enter a topic, choose your filters, then select Research topic." /></Panel> : null}

      {!loading && result ? <div className="mt-6 space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Videos in sample" value={result.sampleSize} detail="Sample count, not number of searches" /><Metric label="Public tags" value={result.tags.length} detail="Distinct public tags after text matching" /><Metric label="Hashtags" value={result.hashtags.length} detail="Found in video titles and descriptions" /><Metric label="Keywords with volume" value={result.providerMetrics.filter((row) => row.searchVolume !== null).length} detail="Rows with reported search volume" /></div>
        {result.warnings.length ? <Callout tone="warning" title="Notes about these results"><ul className="list-disc space-y-1 pl-4">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></Callout> : null}
        <div className="flex gap-1 overflow-x-auto rounded-xl border bg-surface p-1" role="tablist" aria-label="Result category">{(Object.keys(CATEGORY_LABELS) as Category[]).map((key) => <button key={key} role="tab" aria-selected={category === key} onClick={() => setCategory(key)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${category === key ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface-muted hover:text-foreground"}`}>{CATEGORY_LABELS[key]} <span className="ml-1 opacity-65">{countForCategory(result, key)}</span></button>)}</div>
        {category === "generated" ? <Callout tone="warning" title="Generated variants">Excluded from All results.</Callout> : null}
        <KeywordTable rows={rows} title={CATEGORY_LABELS[category]} description={descriptionForCategory(category)} exportLabel={`${result.query}-${category}`} emptyMessage={emptyForCategory(category)} />

        <Panel><div className="panel-header"><div><h2 className="text-sm font-semibold">Spelling and script variations in sample</h2><p className="mt-1 text-xs text-muted">Exact source text close to your topic; no automatic corrections are applied.</p></div><Badge tone="brand">{variations.size} found</Badge></div>{variations.size ? <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">{[...variations].map(([variation, links]) => <div key={variation} className="rounded-lg border p-3"><p className="text-sm font-semibold">{variation}</p><p className="mt-1 text-xs text-muted">{links.length} video{links.length === 1 ? "" : "s"} in sample</p><div className="mt-2 flex flex-wrap gap-2">{links.slice(0, 4).map((link, index) => <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand">Video {index + 1}<ExternalLink className="size-3" /></a>)}</div></div>)}</div> : <EmptyState icon={FlaskConical} title="No close variants found" description="No matching variations were found in the videos in sample. Other variants may still exist." compact />}</Panel>

        <Panel><div className="panel-header"><div><h2 className="text-sm font-semibold">Videos in sample</h2><p className="mt-1 text-xs text-muted">Open the videos used to find title words, public tags, and hashtags.</p></div></div><div className="divide-y">{result.videos.map((video) => <a key={video.id} href={video.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-5 py-3 text-sm transition hover:bg-surface-muted"><Video className="size-4 shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate font-medium">{video.title}</span><span className="hidden text-xs text-muted sm:block">{video.channelTitle}</span><ExternalLink className="size-3.5 text-subtle" /></a>)}</div></Panel>
      </div> : null}
      <span className="sr-only" aria-live="polite">{notice}</span>
    </div>
  );
}

function rowsForCategory(result: ResearchResult, category: Category): KeywordMetric[] {
  if (category === "suggestions") return result.suggestions;
  if (category === "titles") return result.titleKeywords;
  if (category === "tags") return result.tags;
  if (category === "hashtags") return result.hashtags;
  if (category === "related") return result.relatedQueries;
  if (category === "provider") return result.providerMetrics;
  if (category === "generated") return result.generatedCandidates;
  return [...result.suggestions, ...result.titleKeywords, ...result.tags, ...result.hashtags, ...result.relatedQueries, ...result.providerMetrics];
}
function countForCategory(result: ResearchResult, category: Category): number { return rowsForCategory(result, category).length; }
function descriptionForCategory(category: Category): string {
  const descriptions: Record<Category, string> = {
    all: "Compare occurrences across the videos in sample with reported search volume. Every row keeps its source details.",
    suggestions: "Suggestions from YouTube autocomplete for this topic, region, and language. Position in autocomplete is not reported search volume.",
    titles: "Words found in titles from the videos in sample.",
    tags: "Public tags added by uploaders to the videos in sample.",
    hashtags: "Hashtags found in titles and descriptions from the videos in sample.",
    related: "Related queries returned by a configured, supported source.",
    provider: "Reported search volume and competition figures from the named source.",
    generated: "Variants generated from your topic, not observed in a source.",
  }; return descriptions[category];
}
function emptyForCategory(category: Category): string { return category === "provider" ? "No keyword source is connected. Missing values remain Not available, not zero." : category === "related" ? "No supported source returned related queries. Try another topic." : category === "suggestions" ? "YouTube autocomplete is off or returned no suggestions. Turn it on or try another topic." : category === "generated" ? "No generated variants were created. Try another topic." : "No results appeared in this category. Try a broader topic or date range."; }
function Metric({ label, value, detail }: { label: string; value: number; detail: string }) { return <div className="metric-card"><p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</p><p className="mt-3 text-[28px] font-bold leading-none tracking-[-0.04em] tabular-nums">{value}</p><p className="mt-2 text-[11px] leading-5 text-muted">{detail}</p></div>; }
function isResearchResult(value: unknown): value is ResearchResult { return Boolean(value && typeof value === "object" && "query" in value && "videos" in value && "tags" in value); }

function rangePreset(publishedAfter: string | null, retrievedAt: string): string {
  if (!publishedAfter) return "any";
  const days = Math.round((new Date(retrievedAt).getTime() - new Date(publishedAfter).getTime()) / 86_400_000);
  return [1, 2, 7, 28].includes(days) ? String(days) : "any";
}
