"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CalendarRange, ExternalLink, RefreshCw, Save } from "lucide-react";
import { Field, Input, LanguageSelect, RegionSelect, Select } from "@/components/shared/form-fields";
import { PublicationChart } from "@/components/research/publication-chart";
import { TrendTable } from "@/components/research/trend-table";
import { Badge, Button, Callout, EmptyState, LoadingState, PageHeader, Panel } from "@/components/shared/ui";
import { postApi } from "@/lib/client-api";
import { formatDate, formatNumber } from "@/lib/format";
import { createActivity, createProject, createTrendSnapshot, trendFingerprint } from "@/lib/storage";
import { applyHistoricalComparison } from "@/lib/time";
import { updateWorkspace, useWorkspace } from "@/hooks/use-workspace";
import type { TermAggregate, TrendResult } from "@/types/research";

type Timeframe = "24h" | "48h" | "7d" | "28d" | "custom";
type TermTab = "tags" | "hashtags" | "titleKeywords" | "titlePhrases";
const timeframes: [Timeframe, string][] = [["24h", "Last 24 hours"], ["48h", "Last 48 hours"], ["7d", "Last 7 days"], ["28d", "Last 28 days"], ["custom", "Custom dates"]];
const termLabels: Record<TermTab, string> = { tags: "Public tags", hashtags: "Hashtags", titleKeywords: "Title words", titlePhrases: "Title phrases" };
const categories = [["", "All categories"], ["1", "Film & Animation"], ["2", "Autos & Vehicles"], ["10", "Music"], ["15", "Pets & Animals"], ["17", "Sports"], ["20", "Gaming"], ["22", "People & Blogs"], ["23", "Comedy"], ["24", "Entertainment"], ["25", "News & Politics"], ["26", "Howto & Style"], ["27", "Education"], ["28", "Science & Technology"]];

export function TrendingClient() {
  const workspace = useWorkspace();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("US");
  const [language, setLanguage] = useState("en");
  const [timeframe, setTimeframe] = useState<Timeframe>("24h");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [contentType, setContentType] = useState("all");
  const [order, setOrder] = useState("viewCount");
  const [result, setResult] = useState<TrendResult | null>(null);
  const [termTab, setTermTab] = useState<TermTab>("tags");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const defaultsApplied = useRef(false);

  useEffect(() => { const value = new URLSearchParams(window.location.search).get("query"); if (value) setQuery(value); }, []);
  useEffect(() => {
    if (!workspace.hydrated || defaultsApplied.current) return;
    defaultsApplied.current = true;
    const id = new URLSearchParams(window.location.search).get("project");
    const project = workspace.state.projects.find((item) => item.id === id && item.type === "trend");
    if (project && isTrendResult(project.payload)) {
      const specification = project.payload.specification;
      const restored = withHistory(project.payload, workspace.state.trendSnapshots);
      setResult(restored); setQuery(specification.query ?? ""); setRegion(specification.region); setLanguage(specification.language ?? "en");
      setTimeframe(specification.timeframe as Timeframe); setCategoryId(specification.categoryId ?? ""); setContentType(specification.contentType); setOrder(specification.order);
      setCustomStart(specification.customStart?.slice(0, 10) ?? ""); setCustomEnd(specification.customEnd?.slice(0, 10) ?? "");
    } else {
      setRegion(workspace.state.preferences.defaultRegion); setLanguage(workspace.state.preferences.defaultLanguage);
    }
  }, [workspace.hydrated, workspace.state.preferences, workspace.state.projects, workspace.state.trendSnapshots]);

  const currentRows = useMemo<TermAggregate[]>(() => result ? result[termTab] : [], [result, termTab]);
  const viewValues = result?.videos.map((video) => video.statistics.viewCount).filter((value): value is number => value !== null) ?? [];

  const run = async () => {
    if (timeframe === "custom" && (!customStart || !customEnd)) { setError("Choose a start date and an end date."); return; }
    setLoading(true); setError(null);
    try {
      const customPayload = timeframe === "custom" ? {
        customStart: new Date(`${customStart}T00:00:00.000Z`).toISOString(),
        customEnd: new Date(Math.min(Date.now(), new Date(`${customEnd}T23:59:59.999Z`).getTime())).toISOString(),
      } : {};
      const response = await postApi<TrendResult>("/api/trending", {
        query: query.trim() || undefined, region, language, timeframe, ...customPayload,
        categoryId: categoryId || undefined, order, contentType, maxResults: 50,
      });
      const compared = withHistory(response.data, workspace.state.trendSnapshots);
      setResult(compared);
      const snapshot = createTrendSnapshot(response.data);
      updateWorkspace((state) => ({
        ...state,
        activities: [createActivity("trend", query.trim() || `Current regional popular-video chart · ${region}`, response.data.sampleSize), ...state.activities],
        trendSnapshots: state.trendSnapshots.some((item) => item.fingerprint === snapshot.fingerprint && item.result.retrievedAt === snapshot.result.retrievedAt)
          ? state.trendSnapshots
          : [snapshot, ...state.trendSnapshots],
      }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "We couldn’t load short-term trends. Try again."); }
    finally { setLoading(false); }
  };

  const save = () => {
    if (!result) return;
    const project = createProject(`Short-term trends · ${result.query ?? `Current regional popular-video chart (${result.region})`} · ${result.timeframe}`, "trend", result);
    const saved = updateWorkspace((state) => ({ ...state, projects: [project, ...state.projects] }));
    setNotice(saved.ok ? "Saved in this browser." : "Couldn’t save in this browser."); window.setTimeout(() => setNotice(""), 1800);
  };

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="KEYWORD TRENDS"
        title="Keyword trends"
        description="Check how keyword interest and video tags change over time."
        actions={
          result ? (
            <Button variant="secondary" onClick={save}>
              <Save className="size-4" />
              Save results
            </Button>
          ) : undefined
        }
      />
      <Panel>
        <form
          className="p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          <div className="flex gap-1 overflow-x-auto border-b pb-4" role="tablist" aria-label="Time range for keyword trends">
            {timeframes.map(([value, label]) => (
              <button
                type="button"
                key={value}
                role="tab"
                aria-selected={timeframe === value}
                onClick={() => setTimeframe(value)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${timeframe === value ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Field label="Topic (optional)" className="xl:col-span-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Leave blank for popular videos in this region"
              />
            </Field>
            <Field label="Region">
              <RegionSelect value={region} onChange={(event) => setRegion(event.target.value)} />
            </Field>
            <Field label="Language">
              <LanguageSelect value={language} onChange={(event) => setLanguage(event.target.value)} />
            </Field>
            <Field label="Category">
              <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                {categories.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Video length">
              <Select value={contentType} onChange={(event) => setContentType(event.target.value)}>
                <option value="all">All video lengths</option>
                <option value="short">Shorts</option>
                <option value="long">Longer videos (over 3 minutes)</option>
              </Select>
            </Field>
          </div>
          {timeframe === "custom" ? (
            <div className="mt-4 grid max-w-xl gap-4 sm:grid-cols-2">
              <Field label="Start date">
                <Input
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                />
              </Field>
              <Field label="End date">
                <Input
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                />
              </Field>
            </div>
          ) : null}
          <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end">
            <Field label="Sort sampled videos by" className="w-full sm:w-56">
              <Select value={order} onChange={(event) => setOrder(event.target.value)} disabled={!query.trim()}>
                <option value="viewCount">Most viewed</option>
                <option value="date">Newest</option>
                <option value="relevance">Most relevant</option>
              </Select>
            </Field>
            <p className="max-w-2xl text-xs leading-5 text-muted">
              Leave topic blank to see current popular videos in your selected region.
            </p>
            <Button type="submit" className="sm:ml-auto" disabled={loading}>
              {loading ? <RefreshCw className="size-4 animate-spin" /> : <BarChart3 className="size-4" />}
              {loading ? "Loading…" : "Show trends"}
            </Button>
          </div>
        </form>
      </Panel>

      {error ? (
        <Callout className="mt-5" tone="danger" title="Couldn’t load trends">
          {error}
        </Callout>
      ) : null}
      {loading ? (
        <Panel className="mt-6">
          <LoadingState label="Analyzing recent videos" />
        </Panel>
      ) : null}
      {!loading && !result ? (
        <Panel className="mt-6">
          <EmptyState
            icon={CalendarRange}
            title="Check what’s trending on YouTube"
            description="Select a time range and region, then select Show trends."
          />
        </Panel>
      ) : null}
      {!loading && result ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric
              label="Videos analyzed"
              value={String(result.sampleSize)}
              detail="Unique public videos available to analyze"
            />
            <Metric
              label="Channels included"
              value={String(new Set(result.videos.map((video) => video.channelId)).size)}
              detail="Across these videos"
            />
            <Metric
              label="Average views"
              value={viewValues.length ? formatNumber(Math.round(viewValues.reduce((sum, value) => sum + value, 0) / viewValues.length)) : "Not available"}
              detail="Using available view counts"
            />
            <Metric
              label="Terms with comparison data"
              value={String([...result.tags, ...result.hashtags, ...result.titleKeywords, ...result.titlePhrases].filter((row) => ["rising", "stable", "falling"].includes(row.trendStatus)).length)}
              detail="Compared with an earlier matching sample"
            />
            <Metric
              label="Date analyzed"
              value={formatDate(result.retrievedAt, true)}
              detail={`${result.region} · ${result.query ? "recent videos" : "current popular videos"}`}
            />
          </div>
          <Callout tone="info" title="About this sample">
            <strong>{formatDate(result.windowStart, true)}</strong> to <strong>{formatDate(result.windowEnd, true)}</strong> · {result.sampleSize} videos analyzed · {result.region}. If a tag appears in 10 videos, it was used by creators 10 times in this sample—not searched 10 times.
          </Callout>
          {result.warnings.length ? (
            <Callout tone="warning" title="Notes about this sample">
              <ul className="list-disc space-y-1 pl-4">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Callout>
          ) : null}
          <Panel>
            <div className="panel-header">
              <div>
                <h2 className="text-sm font-semibold">Videos by publish date</h2>
                <p className="mt-1 text-xs text-muted">Number of videos published on each date</p>
              </div>
              <Badge tone="brand">UTC publish dates</Badge>
            </div>
            <div className="p-4">
              <PublicationChart videos={result.videos} />
            </div>
          </Panel>
          <div className="flex gap-1 overflow-x-auto rounded-xl border bg-surface p-1" role="tablist" aria-label="Term type">
            {(Object.keys(termLabels) as TermTab[]).map((key) => (
              <button
                key={key}
                onClick={() => setTermTab(key)}
                role="tab"
                aria-selected={termTab === key}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${termTab === key ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface-muted"}`}
              >
                {termLabels[key]} <span className="ml-1 opacity-60">{result[key].length}</span>
              </button>
            ))}
          </div>
          <TrendTable
            rows={currentRows}
            title={termLabels[termTab]}
            exportLabel={`${result.query ?? `popular-${result.region}`}-${result.timeframe}-${termTab}`}
          />
          <Panel>
            <div className="panel-header">
              <div>
                <h2 className="text-sm font-semibold">Videos analyzed</h2>
                <p className="mt-1 text-xs text-muted">Showing up to 20 videos. Open any video to check its details.</p>
              </div>
            </div>
            <div className="divide-y">
              {result.videos.slice(0, 20).map((video) => (
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  key={video.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-surface-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{video.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {video.channelTitle} · Published {formatDate(video.publishedAt, true)} · {formatNumber(video.statistics.viewCount)} views
                    </p>
                  </div>
                  <ExternalLink className="size-3.5 shrink-0 text-subtle" />
                </a>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">{notice}</span>
    </div>
  );
}

function withHistory(result: TrendResult, snapshots: ReturnType<typeof useWorkspace>["state"]["trendSnapshots"]): TrendResult {
  const fingerprint = trendFingerprint(result);
  return {
    ...result,
    tags: applyHistoricalComparison(result.tags, fingerprint, snapshots, "tags", result.retrievedAt, result.videos),
    hashtags: applyHistoricalComparison(result.hashtags, fingerprint, snapshots, "hashtags", result.retrievedAt, result.videos),
    titleKeywords: applyHistoricalComparison(result.titleKeywords, fingerprint, snapshots, "titleKeywords", result.retrievedAt, result.videos),
    titlePhrases: applyHistoricalComparison(result.titlePhrases, fingerprint, snapshots, "titlePhrases", result.retrievedAt, result.videos),
  };
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="metric-card"><p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</p><p className="mt-3 truncate text-xl font-bold leading-none tracking-[-0.035em] tabular-nums" title={value}>{value}</p><p className="mt-2 text-[11px] leading-5 text-muted">{detail}</p></div>; }
function isTrendResult(value: unknown): value is TrendResult { return Boolean(value && typeof value === "object" && "timeframe" in value && "windowStart" in value && "tags" in value); }
