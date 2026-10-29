"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clipboard, Download, RefreshCw, Save, Tags } from "lucide-react";
import { Button, Callout, EmptyState, LoadingState, PageHeader, Panel } from "@/components/shared/ui";
import { Field, Input, Textarea } from "@/components/shared/form-fields";
import { TagChips } from "@/components/shared/tag-chips";
import { VideoCard } from "@/components/shared/video-card";
import { postApi } from "@/lib/client-api";
import { copyText, downloadText } from "@/lib/browser-export";
import { safeFilename, toCsv } from "@/lib/csv";
import { dedupePreservingOriginal, normalizeForMatch } from "@/lib/text";
import { createActivity, createExportEntry, createProject } from "@/lib/storage";
import { updateWorkspace, useWorkspace } from "@/hooks/use-workspace";
import type { ExtractionItem, ExtractionProjectPayload, VideoRecord } from "@/types/research";

export function TagExtractorClient() {
  const workspace = useWorkspace();
  const [inputs, setInputs] = useState("");
  const [channelLimit, setChannelLimit] = useState(20);
  const [deduplicate, setDeduplicate] = useState(workspace.state.preferences.deduplicateTags);
  const [results, setResults] = useState<ExtractionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const defaultsApplied = useRef(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("input");
    if (value) setInputs(value);
  }, []);
  useEffect(() => {
    if (!workspace.hydrated || defaultsApplied.current) return;
    defaultsApplied.current = true;
    const projectId = new URLSearchParams(window.location.search).get("project");
    const project = workspace.state.projects.find((item) => item.id === projectId && item.type === "extraction");
    if (project && isExtractionPayload(project.payload)) {
      setResults(project.payload.results);
      setInputs(project.payload.specification.inputs.join("\n"));
      setChannelLimit(project.payload.specification.channelLimit);
      setDeduplicate(project.payload.specification.deduplicateTags);
    } else {
      setDeduplicate(workspace.state.preferences.deduplicateTags);
    }
  }, [workspace.hydrated, workspace.state.preferences.deduplicateTags, workspace.state.projects]);

  const videos = useMemo(() => results.flatMap((item) => item.videos), [results]);
  const comparison = useMemo(() => compareTags(videos), [videos]);
  const issues = results.filter((item) => item.status !== "complete" || item.error);

  const run = async (onlyInputs?: string[]) => {
    const lines = onlyInputs ?? inputs.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
    if (!lines.length) { setError("Add at least one YouTube video or channel link, handle, or ID."); return; }
    if (lines.length > 20) { setError("Add no more than 20 items at a time."); return; }
    setLoading(true); setError(null); setStage(`Getting tags for ${lines.length} item${lines.length === 1 ? "" : "s"}…`);
    try {
      const response = await postApi<ExtractionItem[]>("/api/extract", { inputs: lines, channelLimit });
      if (onlyInputs) {
        setResults((current) => {
          const retried = new Map(response.data.map((item) => [item.input, item]));
          return current.map((item) => retried.get(item.input) ?? item);
        });
      } else {
        setResults(response.data);
        const count = response.data.reduce((sum, item) => sum + item.videos.length, 0);
        updateWorkspace((state) => ({ ...state, activities: [createActivity("extraction", lines.length === 1 ? lines[0]! : `${lines.length} items checked`, count), ...state.activities] }));
      }
      setStage("Tags ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t get tags from YouTube. Try again.");
      setStage("");
    } finally { setLoading(false); }
  };

  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 1800); };
  const allTags = dedupePreservingOriginal(videos.flatMap((video) => video.tags ?? []));
  const exportResults = (format: "csv" | "json") => {
    if (!results.length) return;
    const filename = safeFilename("youtube-tag-extraction", format);
    type TagExportRow = { input: string; video: VideoRecord; tag: string | null };
    const rows: TagExportRow[] = results.flatMap((item) => item.videos.flatMap<TagExportRow>((video) =>
      video.tags?.length
        ? video.tags.map((tag): TagExportRow => ({ input: item.input, video, tag }))
        : [{ input: item.input, video, tag: null }],
    ));
    const specification = { inputs: inputs.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean), channelLimit, deduplicateTags: deduplicate };
    const content = format === "json" ? JSON.stringify({ exportedAt: new Date().toISOString(), specification, results }, null, 2) : toCsv(rows, [
      { header: "Submitted input", value: (row) => row.input }, { header: "Requested channel limit", value: () => channelLimit },
      { header: "Video ID", value: (row) => row.video.id }, { header: "Video URL", value: (row) => row.video.url },
      { header: "Title", value: (row) => row.video.title }, { header: "Channel", value: (row) => row.video.channelTitle },
      { header: "Channel ID", value: (row) => row.video.channelId }, { header: "Published at", value: (row) => row.video.publishedAt },
      { header: "Tag status", value: (row) => row.video.tagStatus }, { header: "Original tag", value: (row) => row.tag },
      { header: "Title hashtags", value: (row) => row.video.hashtags.title.join(" ") }, { header: "Description hashtags", value: (row) => row.video.hashtags.description.join(" ") },
      { header: "Views", value: (row) => row.video.statistics.viewCount }, { header: "Observed at", value: (row) => row.video.observedAt },
      { header: "Methodology", value: () => "Public tags returned by YouTube; missing tags were not created from title words." },
    ]);
    downloadText(content, filename, format === "json" ? "application/json" : "text/csv");
    updateWorkspace((state) => ({ ...state, exportHistory: [createExportEntry(filename, format, rows.length), ...state.exportHistory] }));
    flash(`Exported ${rows.length} tag entr${rows.length === 1 ? "y" : "ies"}.`);
  };

  const save = () => {
    if (!results.length) return;
    const payload: ExtractionProjectPayload = { specification: { inputs: inputs.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean), channelLimit, deduplicateTags: deduplicate }, results };
    const project = createProject(`YouTube tags · ${videos.length} video${videos.length === 1 ? "" : "s"}`, "extraction", payload);
    const saved = updateWorkspace((state) => ({ ...state, projects: [project, ...state.projects] }));
    flash(saved.ok ? "Saved to this browser." : saved.error ?? "Couldn’t save in this browser.");
  };

  return (
    <div className="page-shell">
      <PageHeader eyebrow="YouTube tags" title="YouTube tag extractor" description="See public tags and hashtags from public YouTube videos. Missing tags are never guessed from titles." actions={results.length ? <><Button variant="secondary" onClick={save}><Save className="size-4" />Save results</Button><Button variant="secondary" onClick={() => exportResults("csv")}><Download className="size-4" />Export CSV</Button><Button variant="secondary" onClick={() => exportResults("json")}>Export JSON</Button></> : undefined} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel>
          <div className="p-5 sm:p-6">
            <Field label="YouTube videos or channels" hint="Paste one link, handle, or ID per line. Add up to 20 items total, including up to 5 channels. Videos, Shorts, live videos, and channels are supported.">
              <Textarea value={inputs} onChange={(event) => setInputs(event.target.value)} rows={6} placeholder={"https://www.youtube.com/watch?v=…\nhttps://youtu.be/…\nhttps://www.youtube.com/@channel"} spellCheck={false} />
            </Field>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Videos to check per channel" className="w-full sm:w-56"><Input type="number" min={1} max={50} value={channelLimit} onChange={(event) => setChannelLimit(Math.min(50, Math.max(1, Number(event.target.value))))} /></Field>
              <label className="flex h-10 items-center gap-2 text-sm text-muted"><input type="checkbox" checked={deduplicate} onChange={(event) => { setDeduplicate(event.target.checked); updateWorkspace((state) => ({ ...state, preferences: { ...state.preferences, deduplicateTags: event.target.checked } })); }} className="size-4 accent-[var(--brand)]" />Hide duplicate tags (ignores capitalization)</label>
              <Button className="sm:ml-auto" onClick={() => run()} disabled={loading || !inputs.trim()}>{loading ? <RefreshCw className="size-4 animate-spin" /> : <Tags className="size-4" />}{loading ? "Getting tags" : "Extract tags"}</Button>
            </div>
          </div>
        </Panel>
        <div className="space-y-3">
          <Callout tone="info" title="Where public tags come from">Public tags are added by video uploaders and returned by YouTube. They are not searches or a measure of audience demand.</Callout>
          <Callout tone="warning" title="When tags are unavailable">YouTube may not return details for private, deleted, restricted, or inaccessible videos. A public video can also be available but have no public tags.</Callout>
        </div>
      </div>

      {error ? <Callout className="mt-6" tone="danger" title="Couldn’t get tags">{error}</Callout> : null}
      {loading ? <Panel className="mt-6"><LoadingState label={stage || "Getting tags from YouTube"} /></Panel> : null}
      {!loading && results.length === 0 ? <Panel className="mt-6"><EmptyState icon={Tags} title="No tags to show yet" description="Add a public YouTube video or channel above, then select Extract tags." /></Panel> : null}

      {!loading && results.length > 0 ? <div className="mt-6 space-y-6">
        <div className="grid gap-3 sm:grid-cols-3"><Summary label="Items checked" value={results.length} /><Summary label="Videos found" value={videos.length} /><Summary label="Unique public tags found" value={allTags.length} /></div>
        {issues.length ? <Callout tone="warning" title={`${issues.length} ${issues.length === 1 ? "item needs" : "items need"} attention`}><ul className="space-y-1">{issues.map((item) => <li key={item.input} className="flex items-center justify-between gap-3"><span className="truncate">{item.input}: {item.error?.message ?? "Some results were unavailable for this item."}</span>{item.error?.retryable ? <Button size="small" variant="secondary" onClick={() => run([item.input])}><RefreshCw className="size-3" />Retry</Button> : null}</li>)}</ul></Callout> : <Callout tone="success" title="Tags ready"><span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3" />Every item was checked successfully.</span></Callout>}

        {videos.length > 1 ? <Panel><div className="panel-header"><div><h2 className="text-sm font-semibold">Compare tags</h2><p className="mt-1 text-xs text-muted">Matching ignores capitalization. Each tag keeps the spelling from the first video where it appears.</p></div><Button variant="secondary" size="small" disabled={!allTags.length} onClick={async () => { try { await copyText(allTags.join(", ")); flash("Copied all tags."); } catch { flash("Couldn’t access the clipboard."); } }}><Clipboard className="size-3.5" />Copy all</Button></div><div className="grid gap-5 p-5 lg:grid-cols-2"><div><h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Tags in every video ({comparison.common.length})</h3><TagChips tags={comparison.common} deduplicate emptyMessage="No shared public tags are available for this comparison." /></div><div><h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Tags found in only one video ({comparison.unique.length})</h3><TagChips tags={comparison.unique} deduplicate emptyMessage="No public tags were found in only one video." /></div></div></Panel> : null}

        <div className="space-y-4">{results.map((item) => <section key={item.input} className="space-y-3">{item.kind === "channel" ? <p className="text-xs font-semibold uppercase tracking-wider text-muted">Channel · {item.videos.length} recent public video{item.videos.length === 1 ? "" : "s"} found</p> : null}{item.videos.map((video) => <VideoCard key={video.id} video={video}><div className="space-y-5"><div><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wider text-muted">Tags added by the uploader</h3><Button variant="ghost" size="small" disabled={!video.tags?.length} onClick={async () => { try { await copyText((deduplicate ? dedupePreservingOriginal(video.tags ?? []) : video.tags ?? []).join(", ")); flash("Copied video tags."); } catch { flash("Couldn’t access the clipboard."); } }}><Clipboard className="size-3" />Copy tags</Button></div><TagChips tags={video.tags ?? []} deduplicate={deduplicate} emptyMessage={video.tagStatus === "unavailable" ? "Tags could not be checked for this video." : video.tagStatus === "empty" ? "This video has no public tags." : "No tags to show for this video."} /></div><div className="grid gap-5 lg:grid-cols-2"><div><h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Title hashtags</h3>{video.hashtags.title.length ? <TagChips tags={video.hashtags.title} emptyMessage="No hashtags were found in this video’s title." /> : <p className="text-sm text-muted">No hashtags were found in this video’s title.</p>}</div><div><h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Description hashtags</h3>{video.hashtags.description.length ? <TagChips tags={video.hashtags.description} emptyMessage="No hashtags were found in this video’s description." /> : <p className="text-sm text-muted">No hashtags were found in this video’s description.</p>}</div></div></div></VideoCard>)}</section>)}</div>
      </div> : null}
      <p className="sr-only" aria-live="polite">{notice}</p>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) { return <div className="metric-card"><p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</p><p className="mt-3 text-[28px] font-bold leading-none tracking-[-0.04em] tabular-nums">{value}</p></div>; }

function compareTags(videos: readonly VideoRecord[]) {
  const maps = videos.map((video) => new Map((video.tags ?? []).map((tag) => [normalizeForMatch(tag), tag])));
  const labels = new Map<string, string>();
  for (const map of maps) for (const [key, label] of map) if (!labels.has(key)) labels.set(key, label);
  const common = maps.length ? [...maps[0]!.keys()].filter((key) => maps.every((map) => map.has(key))).map((key) => labels.get(key)!) : [];
  const counts = new Map<string, number>();
  for (const map of maps) for (const key of map.keys()) counts.set(key, (counts.get(key) ?? 0) + 1);
  const unique = [...counts].filter(([, count]) => count === 1).map(([key]) => labels.get(key)!);
  return { common, unique };
}

function isExtractionPayload(value: unknown): value is ExtractionProjectPayload {
  return Boolean(value && typeof value === "object" && "specification" in value && "results" in value && Array.isArray((value as ExtractionProjectPayload).results));
}
