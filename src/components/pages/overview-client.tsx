"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, ArrowUpRight, BarChart3, Database, Hash, Search, ShieldCheck, Tags, Video } from "lucide-react";
import { Button, EmptyState, PageHeader, Panel, StatCard } from "@/components/shared/ui";
import { Input, Select } from "@/components/shared/form-fields";
import { useWorkspace } from "@/hooks/use-workspace";
import { formatDate } from "@/lib/format";
import { normalizeForMatch } from "@/lib/text";
import type { VideoRecord } from "@/types/research";

type Operation = "research" | "extract" | "hashtags" | "trending" | "competitors";

const activityOperationLabels: Readonly<Record<string, string>> = {
  research: "Topic research",
  extraction: "Tag extraction",
  trend: "Short-term trends",
  competitor: "Tag comparison",
  hashtag: "Hashtag research",
};

const tools = [
  { href: "/keywords", icon: Search, title: "Topic research", description: "Explore suggestions, title words, public tags, hashtags, and available search-volume estimates." },
  { href: "/extract", icon: Tags, title: "Tag extractor", description: "View public tags added by uploaders to a video or recent channel uploads." },
  { href: "/trending", icon: BarChart3, title: "Short-term trends", description: "See how often terms appear in time-filtered video samples or regional popular videos." },
  { href: "/competitors", icon: Video, title: "Tag comparison", description: "Compare public tags, title words, and hashtags across channels without filling in missing data." },
];

export function OverviewClient() {
  const router = useRouter();
  const workspace = useWorkspace();
  const [input, setInput] = useState("");
  const [operation, setOperation] = useState<Operation>("research");
  const metrics = useMemo(() => inspectSavedEvidence(workspace.state.projects.map((project) => project.payload), workspace.state.trendSnapshots), [workspace.state.projects, workspace.state.trendSnapshots]);
  const hasActivity = workspace.state.activities.length > 0 || workspace.state.projects.length > 0 || workspace.state.trendSnapshots.length > 0;

  const launch = () => {
    const value = input.trim();
    if (!value) return;
    const routes: Record<Operation, string> = { research: "/keywords", extract: "/extract", hashtags: "/hashtags", trending: "/trending", competitors: "/competitors" };
    const parameter = operation === "extract" || operation === "competitors" ? "input" : "query";
    router.push(`${routes[operation]}?${parameter}=${encodeURIComponent(value)}`);
  };

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="Overview"
        title="Research with clear sources"
        description="Explore public YouTube data, available search-volume estimates, and local calculations with each type clearly identified."
        actions={<Link href="/sources" className="button-secondary"><Database className="size-4" />View data sources</Link>}
      />

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.5fr)]">
        <Panel className="dashboard-hero overflow-hidden">
          <div className="p-5 sm:p-7">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow-[0_8px_18px_rgba(7,91,86,0.18)]"><Search className="size-[18px]" aria-hidden="true" /></span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-brand-strong">Start research</p>
                <h2 className="mt-1.5 text-xl font-bold tracking-[-0.025em] sm:text-[22px]">Topic, video, or channel</h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">Enter what you want to research, then choose a tool.</p>
              </div>
            </div>
            <div className="mt-6 grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_210px_auto]">
              <Input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") launch(); }} placeholder="Enter a topic or YouTube URL" aria-label="Topic or YouTube URL" />
              <Select value={operation} onChange={(event) => setOperation(event.target.value as Operation)} aria-label="Research tool"><option value="research">Topic research</option><option value="extract">Tag extractor</option><option value="hashtags">Hashtag research</option><option value="trending">Short-term trends</option><option value="competitors">Tag comparison</option></Select>
              <Button onClick={launch} disabled={!input.trim()}>Continue<ArrowRight className="size-4" /></Button>
            </div>
          </div>
        </Panel>

        <section className="trust-card p-5 sm:p-6">
          <div className="relative z-10 flex h-full min-h-44 flex-col">
            <span className="grid size-10 place-items-center rounded-2xl bg-white/14 text-white"><ShieldCheck className="size-5" aria-hidden="true" /></span>
            <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.15em] text-white/70">Data rule</p>
            <h2 className="mt-2 max-w-xs text-lg font-bold leading-6 tracking-[-0.02em]">Missing values stay unavailable</h2>
            <p className="mt-2 max-w-sm text-xs leading-5 text-white/75">If a source does not provide a value, SourceLens does not invent a volume, score, or tag.</p>
            <Link href="/sources" className="mt-auto inline-flex w-fit items-center gap-1.5 pt-5 text-xs font-bold text-white">See data sources<ArrowUpRight className="size-3.5" /></Link>
          </div>
        </section>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard icon={Video} label="Saved videos" value={metrics.videos} detail="Unique videos across saved results" />
        <StatCard icon={Tags} label="Saved tags" value={metrics.tags} detail="Unique public tags across saved results" />
        <StatCard icon={Hash} label="Saved hashtags" value={metrics.hashtags} detail="Unique hashtags from titles and descriptions" />
        <StatCard icon={Search} label="Saved keywords with volume" value={metrics.withVolume} detail="Unique keywords with source-reported estimates" />
        <StatCard icon={BarChart3} label="Saved trend measurements" value={metrics.measuredTrends} detail="Entries marked rising, stable, or falling" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
        <Panel>
          <div className="panel-header"><div><h2 className="text-sm font-bold tracking-[-0.01em]">Featured tools</h2><p className="mt-1 text-xs text-muted">Common ways to start your research.</p></div><span className="badge border-brand/15 bg-brand-soft text-brand-strong">4 featured</span></div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            {tools.map(({ href, icon: Icon, title, description }) => (
              <Link key={href} href={href} className="module-link group p-4 sm:p-5">
                <div className="flex items-start gap-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand-strong"><Icon className="size-[17px]" strokeWidth={1.9} aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold tracking-[-0.01em] group-hover:text-brand-strong">{title}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-muted">{description}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-brand-strong">Open<ArrowRight className="size-3" /></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="panel-header"><div><h2 className="text-sm font-bold tracking-[-0.01em]">Recent activity</h2><p className="mt-1 text-xs text-muted">Saved in this browser</p></div><span className="grid size-9 place-items-center rounded-xl bg-surface-muted text-muted"><Activity className="size-4" /></span></div>
          {!hasActivity ? (
            <EmptyState icon={Activity} title="No recent research yet" description="Choose a featured tool and run research. Your recent activity will appear here." compact />
          ) : (
            <ul className="divide-y">
              {workspace.state.activities.slice(0, 7).map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-surface-muted/60">
                  <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-lg bg-brand-soft"><span className="size-1.5 rounded-full bg-brand" /></span>
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{item.label}</p><p className="mt-0.5 text-[10px] text-muted">{getActivityOperationLabel(item.operation)} · {item.resultCount} result{item.resultCount === 1 ? "" : "s"}</p></div>
                  <time className="shrink-0 text-[10px] text-subtle" dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function getActivityOperationLabel(operation: string) {
  const knownLabel = activityOperationLabels[operation];
  if (knownLabel) return knownLabel;
  const readable = operation.replace(/([a-z0-9])([A-Z])/gu, "$1 $2").replace(/[_-]+/gu, " ").trim();
  return readable ? `${readable.charAt(0).toUpperCase()}${readable.slice(1)}` : "Research";
}

function inspectSavedEvidence(payloads: readonly unknown[], snapshots: readonly { result: { videos: VideoRecord[]; tags: { trendStatus: string }[]; hashtags: { trendStatus: string }[]; titleKeywords: { trendStatus: string }[]; titlePhrases: { trendStatus: string }[] } }[]) {
  const videos = new Map<string, VideoRecord>();
  const volumeKeywords = new Set<string>();
  const visit = (value: unknown, depth = 0) => {
    if (depth > 8 || value === null || value === undefined) return;
    if (Array.isArray(value)) { for (const item of value) visit(item, depth + 1); return; }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.id === "string" && typeof record.title === "string" && Array.isArray(record.tags) && record.hashtags && typeof record.hashtags === "object") videos.set(record.id, record as unknown as VideoRecord);
    if (typeof record.keyword === "string" && typeof record.searchVolume === "number") volumeKeywords.add(normalizeForMatch(record.keyword));
    for (const nested of Object.values(record)) visit(nested, depth + 1);
  };
  for (const payload of payloads) visit(payload);
  for (const snapshot of snapshots) for (const video of snapshot.result.videos) videos.set(video.id, video);
  const tags = new Set<string>();
  const hashtags = new Set<string>();
  for (const video of videos.values()) {
    for (const tag of video.tags ?? []) tags.add(normalizeForMatch(tag));
    for (const hashtag of [...video.hashtags.title, ...video.hashtags.description]) hashtags.add(normalizeForMatch(hashtag.replace(/^#/u, "")));
  }
  const measuredTrends = snapshots.flatMap((snapshot) => [snapshot.result.tags, snapshot.result.hashtags, snapshot.result.titleKeywords, snapshot.result.titlePhrases].flat()).filter((term) => ["rising", "stable", "falling"].includes(term.trendStatus)).length;
  return { videos: videos.size, tags: tags.size, hashtags: hashtags.size, withVolume: volumeKeywords.size, measuredTrends };
}
