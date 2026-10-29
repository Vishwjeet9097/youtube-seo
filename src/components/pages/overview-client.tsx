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
  Play,
  Search,
  ShieldCheck,
  Tags,
  UsersRound,
  Video,
} from "lucide-react";
import { Button, PageHeader } from "@/components/shared/ui";
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

  const activityCounts = useMemo(() => {
    const list = workspace.state.activities;
    const topics = list.filter((a) => a.operation === "research").length;
    const transcripts = list.filter((a) => a.operation === "transcript").length;
    const extractions = list.filter((a) => a.operation === "extraction").length;
    const trends = list.filter((a) => a.operation === "trend").length;
    const hashtags = list.filter((a) => a.operation === "hashtag").length;
    const competitors = list.filter((a) => a.operation === "competitor").length;
    const total = list.length;

    return {
      total,
      topics,
      transcripts,
      extractions,
      trends,
      hashtags,
      competitors,
    };
  }, [workspace.state.activities]);

  return (
    <div className="page-shell space-y-6">
      {/* 1. Header Section */}
      <PageHeader
        eyebrow="DASHBOARD"
        title="Your YouTube research tools"
        description="Find video details, discover related keywords, and compare tags and hashtags in one place."
        actions={
          <div className="flex items-center gap-2.5">
            <Link
              href="/sources"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface px-5 text-xs font-bold text-foreground shadow-xs transition hover:border-brand hover:text-brand"
            >
              <Database className="size-4 text-brand" />
              <span>How data is collected</span>
            </Link>
          </div>
        }
      />

      {/* 2. Top Row: 5 Finnova-Inspired Stat Cards with Rich Visualizations */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* Card 1: Saved Videos */}
        <article className="metric-card flex flex-col justify-between overflow-hidden">
          <div>
            <div className="flex items-start justify-between">
              <span className="text-xs font-bold text-muted">Saved videos</span>
              <span className="grid size-8 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                <Video className="size-4" />
              </span>
            </div>
            <p className="mt-3 text-[32px] font-extrabold tracking-[-0.03em] text-foreground tabular-nums">
              {metrics.videos}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <span>↑</span>
              <span>Videos saved from your research</span>
            </p>
          </div>
          {/* Mini video visual graphic */}
          <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-muted p-2.5">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-lg bg-indigo-600 text-white">
                <Play className="size-3 fill-current ml-0.5" />
              </span>
              <span className="text-[10px] font-semibold text-muted">Library</span>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              Active
            </span>
          </div>
        </article>

        {/* Card 2: Keywords with Search Data (with Finnova Mini Bar Chart!) */}
        <article className="metric-card flex flex-col justify-between overflow-hidden">
          <div>
            <div className="flex items-start justify-between">
              <span className="text-xs font-bold text-muted">Keywords with search data</span>
              <span className="grid size-8 place-items-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
                <Search className="size-4" />
              </span>
            </div>
            <p className="mt-3 text-[32px] font-extrabold tracking-[-0.03em] text-foreground tabular-nums">
              {metrics.withVolume}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
              <span>↑</span>
              <span>Saved keywords with available search estimates</span>
            </p>
          </div>
          {/* Mini Lavender/Indigo Bar Chart Preview */}
          <div className="mt-4 flex items-end gap-1.5 h-8 pt-1">
            <span className="w-full bg-gradient-to-t from-indigo-200 to-indigo-300 dark:from-indigo-900/60 dark:to-indigo-800/80 rounded-t-sm h-[35%]" />
            <span className="w-full bg-gradient-to-t from-indigo-300 to-indigo-400 dark:from-indigo-800/70 dark:to-indigo-700/80 rounded-t-sm h-[55%]" />
            <span className="w-full bg-gradient-to-t from-indigo-400 to-indigo-500 dark:from-indigo-700/80 dark:to-indigo-600 rounded-t-sm h-[40%]" />
            <span className="w-full bg-gradient-to-t from-indigo-500 to-indigo-600 dark:from-indigo-600 dark:to-indigo-500 rounded-t-sm h-[80%]" />
            <span className="w-full bg-gradient-to-t from-indigo-600 to-indigo-500 dark:from-indigo-500 dark:to-indigo-400 rounded-t-sm h-[100%]" />
            <span className="w-full bg-gradient-to-t from-indigo-400 to-indigo-500 dark:from-indigo-700/80 dark:to-indigo-600 rounded-t-sm h-[65%]" />
          </div>
        </article>

        {/* Card 3: Saved Trend Data (with Finnova Dot-Trendline Sparkline!) */}
        <article className="metric-card flex flex-col justify-between overflow-hidden">
          <div>
            <div className="flex items-start justify-between">
              <span className="text-xs font-bold text-muted">Saved trend data</span>
              <span className="grid size-8 place-items-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                <BarChart3 className="size-4" />
              </span>
            </div>
            <p className="mt-3 text-[32px] font-extrabold tracking-[-0.03em] text-foreground tabular-nums">
              {metrics.measuredTrends}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1">
              <span>↑</span>
              <span>Saved records of keyword trends</span>
            </p>
          </div>
          {/* Mini Dot-Trendline SVG Visualizer */}
          <div className="mt-4 relative h-8 w-full flex items-center">
            <svg viewBox="0 0 100 24" className="w-full h-7 overflow-visible">
              <defs>
                <linearGradient id="trendGradientOverview" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M 5,18 Q 25,20 40,12 T 75,8 T 95,4 L 95,24 L 5,24 Z"
                fill="url(#trendGradientOverview)"
              />
              <path
                d="M 5,18 Q 25,20 40,12 T 75,8 T 95,4"
                fill="none"
                stroke="#6366f1"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <circle cx="5" cy="18" r="2.5" fill="#6366f1" />
              <circle cx="40" cy="12" r="2.5" fill="#6366f1" />
              <circle cx="75" cy="8" r="2.5" fill="#6366f1" />
              <circle cx="95" cy="4" r="3" fill="#4f46e5" stroke="#ffffff" strokeWidth="1.5" />
            </svg>
          </div>
        </article>

        {/* Card 4: Saved Tags */}
        <article className="metric-card flex flex-col justify-between overflow-hidden">
          <div>
            <div className="flex items-start justify-between">
              <span className="text-xs font-bold text-muted">Saved tags</span>
              <span className="grid size-8 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <Tags className="size-4" />
              </span>
            </div>
            <p className="mt-3 text-[32px] font-extrabold tracking-[-0.03em] text-foreground tabular-nums">
              {metrics.tags}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <span>↑</span>
              <span>Tags found in saved research</span>
            </p>
          </div>
          <div className="mt-4 flex items-center gap-1.5 flex-wrap">
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[9px] font-bold text-muted">Public</span>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[9px] font-bold text-muted">Studio</span>
            <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 px-2 py-0.5 text-[9px] font-bold">500 char</span>
          </div>
        </article>

        {/* Card 5: Saved Hashtags */}
        <article className="metric-card flex flex-col justify-between overflow-hidden">
          <div>
            <div className="flex items-start justify-between">
              <span className="text-xs font-bold text-muted">Saved hashtags</span>
              <span className="grid size-8 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                <Hash className="size-4" />
              </span>
            </div>
            <p className="mt-3 text-[32px] font-extrabold tracking-[-0.03em] text-foreground tabular-nums">
              {metrics.hashtags}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <span>↑</span>
              <span>Hashtags saved from video titles and descriptions</span>
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between text-[10px] text-muted font-semibold">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-amber-500" />
              Title & Bio
            </span>
            <span>#index</span>
          </div>
        </article>
      </div>

      {/* 3. Middle Discovery Console / Capsule Filter Bar ("GET STARTED") */}
      <section className="dashboard-hero p-6 sm:p-7 rounded-[26px]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-center gap-3.5">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_6px_20px_rgba(79,70,229,0.35)]">
              <Search className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  GET STARTED
                </span>
                <span className="size-1 rounded-full bg-muted/40" />
                <span className="text-[11px] font-semibold text-muted">Universal Explorer</span>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-[-0.02em] text-foreground">
                What do you want to research?
              </h2>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted max-w-md">
            Enter a topic or paste a YouTube link to get started.
          </p>
        </div>

        {/* Input Bar Form with Pill Layout */}
        <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !isActionDisabled) launch();
            }}
            placeholder="Enter a topic or paste a YouTube link"
            aria-label="Enter a topic or paste a YouTube link"
            className="!h-12 !rounded-full !px-5 font-medium shadow-xs"
          />
          <Select
            value={operation}
            onChange={(event) => setOperation(event.target.value as Operation)}
            aria-label="Choose research tool"
            className="!h-12 !rounded-full font-semibold shadow-xs"
          >
            <option value="research">Topic research</option>
            <option value="transcript">Transcripts & summaries</option>
            <option value="extract">Tag extractor</option>
            <option value="trending">Keyword trends</option>
            <option value="hashtags">Hashtag research</option>
            <option value="competitors">Compare tags</option>
          </Select>
          <Button
            onClick={launch}
            disabled={isActionDisabled}
            className="!h-12 !px-7 !rounded-full shadow-md text-sm font-bold"
          >
            <span>Start research</span>
            <ArrowRight className="size-4" />
          </Button>
        </div>

        {validationHint ? (
          <p className="mt-3 text-xs font-semibold text-rose-500 dark:text-rose-400 flex items-center gap-1.5" role="alert">
            <span className="size-1.5 rounded-full bg-rose-500" />
            {validationHint}
          </p>
        ) : null}
      </section>

      {/* 4. Choose a Research Tool & Data Integrity Protocol */}
      <section className="space-y-4">
        {/* Section Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                SUITE
              </span>
              <span className="size-1 rounded-full bg-muted/40" />
              <span className="text-[11px] font-semibold text-muted">All capabilities</span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold tracking-[-0.02em] text-foreground">
              Choose a research tool
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Pick a tool to get started with your YouTube research.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-indigo-600 px-3.5 py-1 font-mono text-xs font-bold text-white shadow-[0_2px_12px_rgba(79,70,229,0.4)]">
              6 tools
            </span>
            <span className="hidden sm:inline-flex rounded-full bg-surface-muted border border-border/80 px-3 py-1 font-mono text-xs font-bold text-muted">
              Official APIs
            </span>
          </div>
        </div>

        {/* Honest Results Card */}
        <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#3b35b6] via-[#312b9d] to-[#1e1a6c] p-5 sm:p-6 border border-indigo-400/30 text-white shadow-[0_12px_36px_rgba(79,70,229,0.2)]">
          <div className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-indigo-400/20 blur-2xl" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/15 text-white shadow-inner">
                <ShieldCheck className="size-6" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-200">
                    HONEST RESULTS
                  </span>
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-bold text-white">
                    Verified
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight mt-0.5">
                  We don’t make up numbers
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-indigo-100/90 max-w-md">
                  If a source does not provide a value, we show it as unavailable instead of guessing.
                </p>
              </div>
            </div>
            <Link
              href="/sources"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-bold text-indigo-950 shadow-md hover:bg-slate-100 hover:scale-105 active:scale-95 transition-all no-underline"
            >
              <span>Learn about our data</span>
              <ArrowUpRight className="size-3.5 text-indigo-900" />
            </Link>
          </div>
        </div>

        {/* 6 Research Tool Cards */}
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map(({ href, icon: Icon, title, description }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col justify-between rounded-[22px] border border-border/80 bg-surface hover:bg-surface-raised p-5 transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 shadow-xs hover:shadow-md no-underline"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-strong transition-all duration-200 group-hover:scale-105 group-hover:bg-brand group-hover:text-white shadow-inner">
                    <Icon className="size-4" />
                  </span>
                  <span className="grid size-7 place-items-center rounded-full bg-surface-muted text-muted transition-colors group-hover:bg-brand-soft group-hover:text-brand-strong">
                    <ArrowUpRight className="size-3.5" />
                  </span>
                </div>
                <div className="mt-3.5 min-w-0">
                  <h3 className="text-sm font-bold text-foreground group-hover:text-brand transition-colors">
                    {title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted line-clamp-2">
                    {description}
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
                <span className="text-[11px] font-bold text-brand">
                  Launch tool
                </span>
                <span className="grid size-6 place-items-center rounded-full bg-brand-soft text-brand-strong group-hover:bg-brand group-hover:text-white transition-all">
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 5. Bottom Signature Container: Recent Activities & Activity Count Analytics */}
      <div className="overflow-hidden rounded-[28px] border border-slate-800/80 bg-[#0e1017] p-6 sm:p-8 text-white shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-white/10">
          <div className="flex items-center gap-3.5">
            <span className="grid size-11 place-items-center rounded-2xl bg-indigo-500/20 text-indigo-400 shadow-inner">
              <Activity className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-400">
                  ACTIVITY INTELLIGENCE
                </span>
                <span className="size-1 rounded-full bg-slate-500" />
                <span className="text-[10px] font-semibold text-slate-400">Local Telemetry</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white mt-0.5">
                Your recent research
              </h2>
              <p className="text-xs text-slate-400">
                Your latest searches and saved results.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-indigo-500/20 border border-indigo-500/30 px-3.5 py-1 text-xs font-mono font-bold text-indigo-300">
              {activityCounts.total} total {activityCounts.total === 1 ? "action" : "actions"}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">
              Feed
            </span>
          </div>
        </div>

        {/* Count Numbers Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Tile 1: Topics Searched */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/5 hover:border-indigo-500/30 p-4 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400">Topic searches</span>
              <span className="grid size-6 place-items-center rounded-lg bg-indigo-500/20 text-indigo-400">
                <Search className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-extrabold tracking-tight text-white tabular-nums">
              {activityCounts.topics}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">Keywords explored</p>
          </div>

          {/* Tile 2: Transcripts Extracted */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/5 hover:border-indigo-500/30 p-4 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400">Transcripts</span>
              <span className="grid size-6 place-items-center rounded-lg bg-purple-500/20 text-purple-400">
                <FileText className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-extrabold tracking-tight text-white tabular-nums">
              {activityCounts.transcripts}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">Videos transcribed</p>
          </div>

          {/* Tile 3: Tag Extractions */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/5 hover:border-indigo-500/30 p-4 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400">Tag extractions</span>
              <span className="grid size-6 place-items-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <Tags className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-extrabold tracking-tight text-white tabular-nums">
              {activityCounts.extractions}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">Videos & channels</p>
          </div>

          {/* Tile 4: Keyword Trends */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/5 hover:border-indigo-500/30 p-4 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400">Trends tracked</span>
              <span className="grid size-6 place-items-center rounded-lg bg-sky-500/20 text-sky-400">
                <BarChart3 className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-extrabold tracking-tight text-white tabular-nums">
              {activityCounts.trends}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">Trend snapshots</p>
          </div>

          {/* Tile 5: Hashtag Searches */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/5 hover:border-indigo-500/30 p-4 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400">Hashtags</span>
              <span className="grid size-6 place-items-center rounded-lg bg-amber-500/20 text-amber-400">
                <Hash className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-extrabold tracking-tight text-white tabular-nums">
              {activityCounts.hashtags}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">Hashtag runs</p>
          </div>

          {/* Tile 6: Tag Comparisons */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/5 hover:border-indigo-500/30 p-4 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400">Comparisons</span>
              <span className="grid size-6 place-items-center rounded-lg bg-rose-500/20 text-rose-400">
                <UsersRound className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-extrabold tracking-tight text-white tabular-nums">
              {activityCounts.competitors}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">Competitors matched</p>
          </div>
        </div>

        {/* Activity Items Feed */}
        <div className="mt-6 pt-6 border-t border-white/10">
          {!hasActivity ? (
            <div className="py-12 text-center rounded-2xl bg-white/[0.02] border border-white/5">
              <div className="mx-auto mb-3.5 grid size-14 place-items-center rounded-2xl bg-white/5 text-slate-400 shadow-inner">
                <Activity className="size-6" />
              </div>
              <h3 className="text-base font-bold text-white">Nothing here yet</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                Your recent research will appear here when you start using the tools.
              </p>
              <Link
                href="/keywords"
                className="mt-5 inline-flex h-9 items-center gap-2 rounded-full bg-indigo-600 px-5 text-xs font-bold text-white shadow-md hover:bg-indigo-500 hover:scale-105 active:scale-95 transition-all no-underline"
              >
                <Search className="size-3.5" />
                <span>Start researching</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1 pb-1">
                <span>Recent Research Stream</span>
                <span>{workspace.state.activities.length} total entries</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {workspace.state.activities.slice(0, 10).map((item, idx) => {
                  const route = activityRouteMap[item.operation] ?? "/keywords";
                  const parameter =
                    item.operation === "extraction" || item.operation === "competitor"
                      ? "input"
                      : "query";
                  const href = `${route}?${parameter}=${encodeURIComponent(item.label)}`;
                  const isFirst = idx === 0;
                  const ItemIcon = getActivityIcon(item.operation);

                  return (
                    <div
                      key={item.id}
                      className={`group relative flex items-center justify-between gap-3 p-3.5 transition-all rounded-2xl ${
                        isFirst
                          ? "bg-gradient-to-r from-indigo-600 via-indigo-600 to-indigo-500 text-white shadow-[0_4px_18px_rgba(79,70,229,0.35)] border border-indigo-400/30"
                          : "bg-[#141824]/90 hover:bg-[#1a2034] border border-white/5 hover:border-indigo-500/30 text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span
                          className={`grid size-10 shrink-0 place-items-center rounded-xl transition-all ${
                            isFirst
                              ? "bg-white/20 text-white shadow-inner"
                              : "bg-white/5 border border-white/10 text-indigo-400 group-hover:text-white group-hover:bg-indigo-600/30"
                          }`}
                        >
                          <ItemIcon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[13px] font-bold text-white tracking-tight">
                              {item.label}
                            </p>
                            {isFirst ? (
                              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white">
                                Active
                              </span>
                            ) : null}
                          </div>
                          <p className={`mt-0.5 truncate text-[11px] ${isFirst ? "text-indigo-100" : "text-slate-400"}`}>
                            {getActivityOperationLabel(item.operation)} · {item.resultCount} result
                            {item.resultCount === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2.5">
                        <time className={`hidden md:inline text-[11px] font-mono ${isFirst ? "text-indigo-200" : "text-slate-400"}`}>
                          {formatDate(item.createdAt)}
                        </time>
                        <Link
                          href={href}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-150 no-underline shadow-xs ${
                            isFirst
                              ? "bg-white text-indigo-800 hover:bg-slate-100 hover:shadow-md hover:scale-[1.03] active:scale-[0.98]"
                              : "bg-white/10 text-white hover:bg-indigo-600 hover:border-indigo-400 border border-white/10 hover:shadow-md hover:scale-[1.03] active:scale-[0.98]"
                          }`}
                          title="View results"
                        >
                          <span>View results</span>
                          <ArrowRight className="size-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getActivityIcon(operation: string) {
  switch (operation) {
    case "extraction":
      return Tags;
    case "trend":
      return BarChart3;
    case "competitor":
      return UsersRound;
    case "transcript":
      return FileText;
    case "hashtag":
      return Hash;
    case "research":
    default:
      return Search;
  }
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
