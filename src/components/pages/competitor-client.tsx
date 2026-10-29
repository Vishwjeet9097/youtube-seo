"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clipboard, Download, Save, UsersRound } from "lucide-react";
import { Field, Input, Select, Textarea } from "@/components/shared/form-fields";
import { TagChips } from "@/components/shared/tag-chips";
import { VideoCard } from "@/components/shared/video-card";
import { Button, Callout, EmptyState, LoadingState, PageHeader, Panel } from "@/components/shared/ui";
import { copyText, downloadText } from "@/lib/browser-export";
import { postApi } from "@/lib/client-api";
import { safeFilename, toCsv } from "@/lib/csv";
import { createActivity, createExportEntry, createProject } from "@/lib/storage";
import { updateWorkspace, useWorkspace } from "@/hooks/use-workspace";
import type { CompetitorComparison } from "@/types/research";

export function CompetitorClient() {
  const workspace = useWorkspace();
  const [inputs, setInputs] = useState("");
  const [referenceIndex, setReferenceIndex] = useState(0);
  const [channelLimit, setChannelLimit] = useState(10);
  const [result, setResult] = useState<CompetitorComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const autoSubmittedRef = useRef(false);
  const lines = useMemo(() => inputs.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean), [inputs]);

  const run = async (overrideInputs?: string[]) => {
    const targetLines = overrideInputs ?? lines;
    if (targetLines.length < 2) { setError("Add at least two YouTube video or channel links, handles, or IDs."); return; }
    if (targetLines.length > 20) { setError("Add no more than 20 items to a comparison."); return; }
    setLoading(true); setError(null);
    try {
      const response = await postApi<CompetitorComparison>("/api/competitors", { inputs: targetLines, referenceIndex, channelLimit });
      setResult(response.data);
      updateWorkspace((state) => ({ ...state, activities: [createActivity("competitor", `${targetLines.length} items compared`, response.data.sampleSize), ...state.activities], comparisonHistory: [response.data, ...state.comparisonHistory] }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Couldn’t compare these tags. Check the inputs and try again."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("input");
    if (value) {
      setInputs(value);
      const parsedLines = value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
      if (!autoSubmittedRef.current && parsedLines.length >= 2) {
        autoSubmittedRef.current = true;
        void run(parsedLines);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!workspace.hydrated) return;
    const id = new URLSearchParams(window.location.search).get("project");
    const project = workspace.state.projects.find((item) => item.id === id && item.type === "competitor");
    if (project && isComparison(project.payload)) {
      setResult(project.payload);
      setInputs(project.payload.specification.inputs.join("\n"));
      setReferenceIndex(project.payload.specification.referenceIndex);
      setChannelLimit(project.payload.specification.channelLimit);
    }
  }, [workspace.hydrated, workspace.state.projects]);
  useEffect(() => { if (referenceIndex >= lines.length) setReferenceIndex(0); }, [lines.length, referenceIndex]);



  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 1800); };
  const save = () => {
    if (!result) return;
    const saved = updateWorkspace((state) => ({ ...state, projects: [createProject(`Tag comparison · ${result.sampleSize} videos`, "competitor", result), ...state.projects] }));
    flash(saved.ok ? "Saved to this browser." : saved.error ?? "Couldn’t save in this browser.");
  };
  const exportData = (format: "csv" | "json") => {
    if (!result) return;
    const filename = safeFilename("competitor-tag-gap", format);
    const allTags = new Set(Object.values(result.tagsByVideo).flat());
    const rows = [...allTags].map((tag) => ({ tag, common: result.commonTags.includes(tag), missing: result.missingFromReference.includes(tag), videos: result.videos.filter((item) => Object.values(item.normalizedTags).includes(tag)).map((item) => item.video.id).join(" | ") }));
    const content = format === "json" ? JSON.stringify(result, null, 2) : toCsv(rows, [{ header: "Original tag", value: (row) => row.tag }, { header: "Common to all", value: (row) => row.common }, { header: "Missing from selected reference", value: (row) => row.missing }, { header: "Observed video IDs", value: (row) => row.videos }]);
    downloadText(content, filename, format === "json" ? "application/json" : "text/csv");
    updateWorkspace((state) => ({ ...state, exportHistory: [createExportEntry(filename, format, rows.length), ...state.exportHistory] }));
    flash(`Exported tag comparison as ${format.toUpperCase()}.`);
  };

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="COMPARE TAGS"
        title="Compare tags"
        description="Compare tags from two or more videos to see what they have in common."
        actions={
          result ? (
            <>
              <Button variant="secondary" onClick={save}>
                <Save className="size-4" />
                Save results
              </Button>
              <Button variant="secondary" onClick={() => exportData("csv")}>
                <Download className="size-4" />
                Export CSV
              </Button>
              <Button variant="secondary" onClick={() => exportData("json")}>
                Export JSON
              </Button>
            </>
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
          <Field
            label="YouTube videos or channels"
            hint="Paste one link per line (2 to 20 links). You can also choose a reference video to see which tags it is missing."
          >
            <Textarea
              rows={6}
              value={inputs}
              onChange={(event) => setInputs(event.target.value)}
              placeholder={"Your video or channel\nAnother video or channel\nAnother @channel"}
            />
          </Field>
          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(220px,1fr)_220px_auto]">
            <Field label="Reference video">
              <Select
                value={referenceIndex}
                onChange={(event) => setReferenceIndex(Number(event.target.value))}
                disabled={!lines.length}
              >
                {lines.length ? (
                  lines.map((line, index) => (
                    <option value={index} key={`${line}:${index}`}>
                      {index + 1}. {line.slice(0, 70)}
                    </option>
                  ))
                ) : (
                  <option>No inputs yet</option>
                )}
              </Select>
            </Field>
            <Field label="Videos to check per channel">
              <Input
                type="number"
                min={1}
                max={50}
                value={channelLimit}
                onChange={(event) =>
                  setChannelLimit(Math.min(50, Math.max(1, Number(event.target.value))))
                }
              />
            </Field>
            <Button
              type="submit"
              className="self-end"
              disabled={loading || lines.length < 2}
            >
              <UsersRound className="size-4" />
              {loading ? "Comparing tags" : "Compare tags"}
            </Button>
          </div>
        </form>
      </Panel>
      {error ? (
        <Callout className="mt-5" tone="danger" title="Couldn’t compare tags">
          {error}
        </Callout>
      ) : null}
      {loading ? (
        <Panel className="mt-6">
          <LoadingState label="Comparing video tags" />
        </Panel>
      ) : null}
      {!loading && !result ? (
        <Panel className="mt-6">
          <EmptyState
            icon={UsersRound}
            title="Compare tags across videos"
            description="Add two or more YouTube links above and select Compare tags."
          />
        </Panel>
      ) : null}
      {!loading && result ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Videos compared" value={result.sampleSize} />
            <Metric label="Tags in every video" value={result.commonTags.length} />
            <Metric label="Missing from reference" value={result.missingFromReference.length} />
            <Metric label="Date checked" value={new Date(result.retrievedAt).toLocaleDateString()} />
          </div>
          {result.warnings.length ? (
            <Callout tone="warning" title="Notes about this comparison">
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
                <h2 className="text-sm font-semibold">Tag comparison</h2>
                <p className="mt-1 text-xs text-muted">
                  Reference: {result.referenceVideoId ?? "First video"}
                </p>
              </div>
              <Button
                variant="secondary"
                size="small"
                disabled={!result.missingFromReference.length}
                onClick={async () => {
                  try {
                    await copyText(result.missingFromReference.join(", "));
                    flash("Copied tags missing from the reference video.");
                  } catch {
                    flash("Couldn’t access the clipboard.");
                  }
                }}
              >
                <Clipboard className="size-3.5" />
                Copy missing tags
              </Button>
            </div>
            <div className="grid gap-px bg-border lg:grid-cols-2">
              <div className="bg-surface p-5">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">
                  Tags in every video ({result.commonTags.length})
                </h3>
                <TagChips
                  tags={result.commonTags}
                  deduplicate
                  emptyMessage="No shared tags found between these videos."
                />
              </div>
              <div className="bg-surface p-5">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">
                  Tags missing from reference ({result.missingFromReference.length})
                </h3>
                <TagChips
                  tags={result.missingFromReference}
                  deduplicate
                  emptyMessage={
                    result.referenceVideoId
                      ? "The reference video already has all the tags found in the other videos."
                      : "Tag differences are unavailable."
                  }
                />
              </div>
            </div>
          </Panel>
          <Panel>
            <div className="panel-header">
              <div>
                <h2 className="text-sm font-semibold">Common title words and hashtags</h2>
                <p className="mt-1 text-xs text-muted">
                  Words from video titles and hashtags that appear across these videos.
                </p>
              </div>
            </div>
            <div className="grid gap-px bg-border lg:grid-cols-2">
              <div className="bg-surface p-5">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">
                  Words in every title
                </h3>
                <TagChips
                  tags={result.commonTitleKeywords}
                  deduplicate
                  emptyMessage="No title words are shared by every video."
                />
              </div>
              <div className="bg-surface p-5">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">
                  Hashtags in every video
                </h3>
                <TagChips
                  tags={result.commonHashtags}
                  deduplicate
                  emptyMessage="No hashtags are shared by every video."
                />
              </div>
            </div>
          </Panel>
          <div className="space-y-4">
            {result.videos.map((item) => (
              <VideoCard key={item.video.id} video={item.video}>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">
                  Tags on this video
                </h3>
                <TagChips
                  tags={Object.values(item.normalizedTags)}
                  emptyMessage={
                    item.video.tagStatus === "unavailable"
                      ? "Tags could not be checked for this video."
                      : item.video.tagStatus === "empty"
                        ? "This video has no public tags."
                        : "No tags found for this video."
                  }
                />
              </VideoCard>
            ))}
          </div>
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">{notice}</span>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: number | string }) { return <div className="metric-card"><p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</p><p className="mt-3 text-2xl font-bold leading-none tracking-[-0.035em] tabular-nums">{value}</p></div>; }
function isComparison(value: unknown): value is CompetitorComparison { return Boolean(value && typeof value === "object" && "commonTags" in value && "missingFromReference" in value && "videos" in value); }
