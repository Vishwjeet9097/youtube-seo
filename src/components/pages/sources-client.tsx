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
      <PageHeader
        eyebrow="HONEST DATA"
        title="Data sources and methods"
        description="See how we collect data, what each number means, and where our estimates come from."
        actions={
          <a
            className="button-secondary"
            href="https://developers.google.com/youtube/v3/docs"
            target="_blank"
            rel="noopener noreferrer"
          >
            YouTube API documentation
            <ExternalLink className="size-4" />
          </a>
        }
      />
      {statusError ? (
        <Callout tone="danger" title="Couldn’t load source status">
          {statusError}
        </Callout>
      ) : null}
      {!status && !statusError ? (
        <Panel>
          <LoadingState label="Checking data sources" />
        </Panel>
      ) : null}
      {status ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {status.providers.map((provider) => (
            <Panel className="p-5" key={provider.id}>
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`grid size-9 place-items-center rounded-lg ${provider.live ? "bg-success-soft text-success" : "bg-surface-muted text-muted"}`}
                >
                  {provider.live ? <CheckCircle2 className="size-4" /> : <ServerOff className="size-4" />}
                </span>
                <Badge
                  tone={provider.live ? "success" : provider.configured ? "warning" : "neutral"}
                >
                  {provider.live ? "Connected" : provider.configured ? "File import only" : "Not connected"}
                </Badge>
              </div>
              <h2 className="mt-4 text-sm font-semibold">{provider.name}</h2>
              <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-5 text-muted">
                {provider.supplies.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-4 border-t pt-3 text-[11px] leading-5 text-muted">
                {provider.limitation}
              </p>
            </Panel>
          ))}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <Panel>
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-semibold">What each metric means</h2>
              <p className="mt-1 text-xs text-muted">
                We clearly separate direct data from third-party estimates.
              </p>
            </div>
            <ShieldCheck className="size-4 text-brand" />
          </div>
          <div className="divide-y">
            {[
              [
                "Estimated search volume",
                "A monthly search estimate provided by a third-party keyword data provider. When no keyword provider is connected, search volume is shown as unavailable, not zero.",
              ],
              [
                "Google Trends relative interest",
                "A relative score from 0 to 100 within an imported comparison, region, and time range. It represents relative popularity over time, not an exact search count.",
              ],
              [
                "Search suggestions",
                "Words and phrases returned by YouTube autocomplete when a topic is typed. Having a suggestion appear does not guarantee high search volume.",
              ],
              [
                "Appearances in videos checked",
                "The number of analyzed videos that include a tag, title word, or hashtag. This measures what creators use, not what viewers search.",
              ],
              [
                "Video views and stats",
                "Public view counts and details retrieved directly from YouTube. If a video hides its views, we show them as unavailable.",
              ],
              [
                "Trend changes over time",
                "How the share of videos using a tag changed compared to an earlier saved check. A rise of more than 5% is Rising; a drop of more than 5% is Falling.",
              ],
            ].map(([name, description]) => (
              <div key={name} className="px-5 py-4">
                <h3 className="text-sm font-semibold">{name}</h3>
                <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
              </div>
            ))}
          </div>
        </Panel>
        <div className="space-y-6">
          <Panel>
            <div className="panel-header">
              <div>
                <h2 className="text-sm font-semibold">Saved on this device</h2>
                <p className="mt-1 text-xs text-muted">
                  Your research stays in this browser and is never uploaded to external servers.
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-px bg-border">
              <div className="bg-surface p-4">
                <dt className="text-xs text-muted">Trend records</dt>
                <dd className="mt-1 text-xl font-bold">{workspace.state.trendSnapshots.length}</dd>
              </div>
              <div className="bg-surface p-4">
                <dt className="text-xs text-muted">Saved items</dt>
                <dd className="mt-1 text-xl font-bold">{workspace.state.projects.length}</dd>
              </div>
              <div className="col-span-2 bg-surface p-4">
                <dt className="text-xs text-muted">Latest trend record</dt>
                <dd className="mt-1 text-sm font-semibold">
                  {latestSnapshot
                    ? `${latestSnapshot.result.sampleSize} videos · ${new Date(latestSnapshot.result.retrievedAt).toLocaleString()}`
                    : "No trend records saved yet"}
                </dd>
              </div>
            </dl>
          </Panel>
          <Callout tone="warning" title="API usage and freshness">
            YouTube limits how many requests our servers can make each day. Data is cached temporarily to save requests and keep response times fast.
          </Callout>
        </div>
      </div>

      <Panel className="mt-6">
        <div className="panel-header">
          <div>
            <h2 className="text-sm font-semibold">Import Google Trends data</h2>
            <p className="mt-1 text-xs text-muted">
              Add relative interest data exported from Google Trends as a CSV or JSON file.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importTrends(file);
              }}
            />
            <Button
              variant="secondary"
              size="small"
              onClick={() => downloadText(template, "google-trends-import-template.csv", "text/csv")}
            >
              <Download className="size-3.5" />
              Download template
            </Button>
            <Button size="small" onClick={() => inputRef.current?.click()}>
              <FileUp className="size-3.5" />
              Import file
            </Button>
            {metrics.length ? (
              <Button variant="secondary" size="small" onClick={saveImport}>
                Save on this device
              </Button>
            ) : null}
          </div>
        </div>
        <div className="p-5">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-muted">
            <li>Open Google Trends and choose your topic, region, and time range, then download the data as CSV.</li>
            <li>Ensure the file includes these columns: <code>keyword</code>, <code>trendIndex</code>, <code>observedAt</code>, <code>region</code>, <code>timeframe</code>, and <code>searchProperty</code>.</li>
            <li>Select your file using the Import file button above. Numbers show relative interest from 0 to 100, not exact monthly search volume.</li>
          </ol>
        </div>
        {metrics.length ? (
          <div className="border-t p-4">
            <KeywordTable
              rows={metrics}
              title={`Imported trends · ${importName}`}
              description="Data imported from your file."
              exportLabel="google-trends-import"
            />
          </div>
        ) : (
          <div className="border-t">
            <EmptyState
              icon={Database}
              title="No Google Trends data imported"
              description="Download the template or choose an existing Google Trends CSV file to import."
              compact
            />
          </div>
        )}
      </Panel>

      <Panel className="mt-6">
        <div className="panel-header">
          <div>
            <h2 className="text-sm font-semibold">How to read results</h2>
            <p className="mt-1 text-xs text-muted">Important things to keep in mind.</p>
          </div>
        </div>
        <div className="grid gap-px bg-border md:grid-cols-2">
          <div className="bg-surface p-5">
            <h3 className="text-sm font-semibold">Missing video tags</h3>
            <p className="mt-2 text-xs leading-5 text-muted">
              A video may have no tags because the creator chose not to add any, or because the video is private, unlisted, or restricted. If a video has no tags, we display “No public tags.” We never make up tags from the video title.
            </p>
          </div>
          <div className="bg-surface p-5">
            <h3 className="text-sm font-semibold">Unavailable search volume</h3>
            <p className="mt-2 text-xs leading-5 text-muted">
              YouTube does not publicly share exact monthly search numbers for all terms. Without a connected keyword provider, search volume is shown as unavailable instead of guessing a number.
            </p>
          </div>
          <div className="bg-surface p-5">
            <h3 className="text-sm font-semibold">Popular charts vs search history</h3>
            <p className="mt-2 text-xs leading-5 text-muted">
              When checking keyword trends without a topic, we analyze currently popular videos in your selected region. This reflects what is popular right now.
            </p>
          </div>
          <div className="bg-surface p-5">
            <h3 className="text-sm font-semibold">Data saved on this device</h3>
            <p className="mt-2 text-xs leading-5 text-muted">
              All your saved projects, favorites, and history stay inside your local browser. They are not stored on external servers or synced to other devices unless you export a backup.
            </p>
          </div>
        </div>
      </Panel>
      <span className="sr-only" aria-live="polite">{notice}</span>
    </div>
  );
}
