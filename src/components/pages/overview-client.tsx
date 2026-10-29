"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Database,
  FileText,
  Hash,
  Search,
  ShieldCheck,
  Tags,
  UsersRound,
  Video,
} from "lucide-react";
import { Button, EmptyState, PageHeader, Panel, StatCard } from "@/components/shared/ui";
import { Input, Select } from "@/components/shared/form-fields";
import { useWorkspace } from "@/hooks/use-workspace";
import { formatDate } from "@/lib/format";
import { normalizeForMatch } from "@/lib/text";
import { parseYouTubeInput } from "@/lib/youtube-url";
import type { VideoRecord } from "@/types/research";

type Operation = "research" | "transcript" | "extract" | "trending" | "hashtags" | "competitors";

const activityOperationLabels: Readonly<Record<string, string>> = {
  research: "Topic research",
  extraction: "Tag extractor",
  trend: "Keyword trends",
  competitor: "Compare tags",
  hashtag: "Hashtag research",
  transcript: "Transcripts & summaries",
};

const activityRouteMap: Readonly<Record<string, string>> = {
  research: "/keywords",
  extraction: "/extract",
  trend: "/trending",
  competitor: "/competitors",
  hashtag: "/hashtags",
  transcript: "/transcript",
};

const tools = [
  {
    href: "/transcript",
    icon: FileText,
    title: "Transcripts & summaries",
    description: "Get a video transcript and a short summary.",
  },
  {
    href: "/keywords",
    icon: Search,
    title: "Topic research",
    description: "Explore a topic and find related search terms.",
  },
  {
    href: "/extract",
    icon: Tags,
    title: "Tag extractor",
    description: "Find the tags used on a YouTube video.",
  },
  {
    href: "/trending",
    icon: BarChart3,
    title: "Keyword trends",
    description: "Check how keyword interest changes over time.",
  },
  {
    href: "/hashtags",
    icon: Hash,
    title: "Hashtag research",
    description: "Find hashtags used in video titles and descriptions.",
  },
  {
    href: "/competitors",
    icon: UsersRound,
    title: "Compare tags",
    description: "Compare tags from two or more videos.",
  },
];

export function OverviewClient() {
  const router = useRouter();
  const workspace = useWorkspace();
  const [input, setInput] = useState("");
  const [operation, setOperation] = useState<Operation>("research");
  const metrics = useMemo(
    () =>
      inspectSavedEvidence(
        workspace.state.projects.map((project) => project.payload),
        workspace.state.trendSnapshots,
      ),
    [workspace.state.projects, workspace.state.trendSnapshots],
  );
  const hasActivity =
    workspace.state.activities.length > 0 ||
    workspace.state.projects.length > 0 ||
    workspace.state.trendSnapshots.length > 0;

  // Validation logic based on selected tool requirements
  const trimmed = input.trim();
  const parsed = trimmed ? parseYouTubeInput(trimmed) : null;
  const isVideoOrChannelUrl = parsed && parsed.kind !== "invalid";
  const isVideoUrl = parsed && parsed.kind === "video";

  const getValidationHint = (): string | null => {
    if (!trimmed) return null;
    if (operation === "transcript" && !isVideoUrl) {
      return "Paste a YouTube video link to get its transcript.";
    }
    if (operation === "extract" && !isVideoOrChannelUrl) {
      return "Paste a YouTube video link to extract its tags.";
    }
    if (operation === "competitors" && !isVideoOrChannelUrl) {
      return "Paste a YouTube video link to compare tags.";
    }
    return null;
  };

  const validationHint = getValidationHint();
  const isActionDisabled = !trimmed || Boolean(validationHint);

  const launch = () => {
    if (isActionDisabled) return;
    const routes: Record<Operation, string> = {
      research: "/keywords",
      transcript: "/transcript",
      extract: "/extract",
      trending: "/trending",
      hashtags: "/hashtags",
      competitors: "/competitors",
    };
    const parameter =
      operation === "extract" || operation === "competitors" || operation === "transcript"
        ? "input"
        : "query";
    router.push(`${routes[operation]}?${parameter}=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="DASHBOARD"
        title="Your YouTube research tools"
        description="Find video details, discover related keywords, and compare tags and hashtags in one place."
        actions={
          <Link href="/sources" className="button-secondary">
            <Database className="size-4" />
            How data is collected
          </Link>
        }
      />

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.5fr)]">
        <Panel className="dashboard-hero overflow-hidden">
          <div className="p-5 sm:p-7">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow-[0_8px_18px_rgba(7,91,86,0.18)]">
                <Search className="size-[18px]" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-brand-strong">
                  GET STARTED
                </p>
                <h2 className="mt-1.5 text-xl font-bold tracking-[-0.025em] sm:text-[22px]">
                  What do you want to research?
                </h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">
                  Enter a topic or paste a YouTube link to get started.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !isActionDisabled) launch();
                }}
                placeholder="Enter a topic or paste a YouTube link"
                aria-label="Enter a topic or paste a YouTube link"
              />
              <Select
                value={operation}
                onChange={(event) => setOperation(event.target.value as Operation)}
                aria-label="Choose research tool"
              >
                <option value="research">Topic research</option>
                <option value="transcript">Transcripts & summaries</option>
                <option value="extract">Tag extractor</option>
                <option value="trending">Keyword trends</option>
                <option value="hashtags">Hashtag research</option>
                <option value="competitors">Compare tags</option>
              </Select>
              <Button onClick={launch} disabled={isActionDisabled}>
                Start research
                <ArrowRight className="size-4" />
              </Button>
            </div>

            {validationHint ? (
              <p className="mt-2.5 text-xs font-medium text-warning" role="alert">
                {validationHint}
              </p>
            ) : null}
          </div>
        </Panel>

        <section className="trust-card p-5 sm:p-6">
          <div className="relative z-10 flex h-full min-h-44 flex-col">
            <span className="grid size-10 place-items-center rounded-2xl bg-white/14 text-white">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.15em] text-white/70">
              HONEST RESULTS
            </p>
            <h2 className="mt-2 max-w-xs text-lg font-bold leading-6 tracking-[-0.02em]">
              We don’t make up numbers
            </h2>
            <p className="mt-2 max-w-sm text-xs leading-5 text-white/75">
              If a source does not provide a value, we show it as unavailable instead of guessing.
            </p>
            <Link
              href="/sources"
              className="mt-auto inline-flex w-fit items-center gap-1.5 pt-5 text-xs font-bold text-white hover:underline"
            >
              Learn about our data
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </section>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          icon={Video}
          label="Saved videos"
          value={metrics.videos}
          detail="Videos saved from your research"
        />
        <StatCard
          icon={Tags}
          label="Saved tags"
          value={metrics.tags}
          detail="Tags found in saved research"
        />
        <StatCard
          icon={Hash}
          label="Saved hashtags"
          value={metrics.hashtags}
          detail="Hashtags saved from video titles and descriptions"
        />
        <StatCard
          icon={Search}
          label="Keywords with search data"
          value={metrics.withVolume}
          detail="Saved keywords with available search estimates"
        />
        <StatCard
          icon={BarChart3}
          label="Saved trend data"
          value={metrics.measuredTrends}
          detail="Saved records of keyword trends"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
        <Panel>
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-bold tracking-[-0.01em]">Choose a research tool</h2>
              <p className="mt-1 text-xs text-muted">
                Pick a tool to get started with your YouTube research.
              </p>
            </div>
            <span className="badge border-brand/15 bg-brand-soft text-brand-strong">
              6 tools
            </span>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            {tools.map(({ href, icon: Icon, title, description }) => (
              <Link key={href} href={href} className="module-link group p-4 sm:p-5">
                <div className="flex items-start gap-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand-strong">
                    <Icon className="size-[17px]" strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold tracking-[-0.01em] group-hover:text-brand-strong">
                      {title}
                    </h3>
                    <p className="mt-1.5 text-xs leading-5 text-muted">{description}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-brand-strong">
                      Open
                      <ArrowRight className="size-3" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-bold tracking-[-0.01em]">Your recent research</h2>
              <p className="mt-1 text-xs text-muted">Your latest searches and saved results.</p>
            </div>
            <span className="grid size-9 place-items-center rounded-xl bg-surface-muted text-muted">
              <Activity className="size-4" />
            </span>
          </div>
          {!hasActivity ? (
            <EmptyState
              icon={Activity}
              title="Nothing here yet"
              description="Your recent research will appear here when you start using the tools."
              action={
                <Link href="/keywords" className="button-secondary !h-8 !px-3 !text-xs">
                  <Search className="size-3.5" />
                  Start researching
                </Link>
              }
              compact
            />
          ) : (
            <ul className="divide-y">
              {workspace.state.activities.slice(0, 7).map((item) => {
                const route = activityRouteMap[item.operation] ?? "/keywords";
                const parameter =
                  item.operation === "extraction" || item.operation === "competitor"
                    ? "input"
                    : "query";
                const href = `${route}?${parameter}=${encodeURIComponent(item.label)}`;

                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-surface-muted/60"
                  >
                    <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-lg bg-brand-soft">
                      <span className="size-1.5 rounded-full bg-brand" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{item.label}</p>
                      <p className="mt-0.5 text-[10px] text-muted">
                        {getActivityOperationLabel(item.operation)} · {item.resultCount} result
                        {item.resultCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <time className="text-[10px] text-subtle" dateTime={item.createdAt}>
                        {formatDate(item.createdAt)}
                      </time>
                      <Link
                        href={href}
                        className="text-[11px] font-bold text-brand hover:underline"
                        title="View results"
                      >
                        View results
                      </Link>
                    </div>
                  </li>
                );
              })}
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

function inspectSavedEvidence(
  payloads: readonly unknown[],
  snapshots: readonly {
    result: {
      videos: VideoRecord[];
      tags: { trendStatus: string }[];
      hashtags: { trendStatus: string }[];
      titleKeywords: { trendStatus: string }[];
      titlePhrases: { trendStatus: string }[];
    };
  }[],
) {
  const videos = new Map<string, VideoRecord>();
  const volumeKeywords = new Set<string>();
  const visit = (value: unknown, depth = 0) => {
    if (depth > 8 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (
      typeof record.id === "string" &&
      typeof record.title === "string" &&
      Array.isArray(record.tags) &&
      record.hashtags &&
      typeof record.hashtags === "object"
    ) {
      videos.set(record.id, record as unknown as VideoRecord);
    }
    if (typeof record.keyword === "string" && typeof record.searchVolume === "number") {
      volumeKeywords.add(normalizeForMatch(record.keyword));
    }
    for (const nested of Object.values(record)) visit(nested, depth + 1);
  };
  for (const payload of payloads) visit(payload);
  for (const snapshot of snapshots) {
    for (const video of snapshot.result.videos) videos.set(video.id, video);
  }
  const tags = new Set<string>();
  const hashtags = new Set<string>();
  for (const video of videos.values()) {
    for (const tag of video.tags ?? []) tags.add(normalizeForMatch(tag));
    for (const hashtag of [...video.hashtags.title, ...video.hashtags.description]) {
      hashtags.add(normalizeForMatch(hashtag.replace(/^#/u, "")));
    }
  }
  const measuredTrends = snapshots
    .flatMap((snapshot) => [
      snapshot.result.tags,
      snapshot.result.hashtags,
      snapshot.result.titleKeywords,
      snapshot.result.titlePhrases,
    ].flat())
    .filter((term) => ["rising", "stable", "falling"].includes(term.trendStatus)).length;
  return {
    videos: videos.size,
    tags: tags.size,
    hashtags: hashtags.size,
    withVolume: volumeKeywords.size,
    measuredTrends,
  };
}
