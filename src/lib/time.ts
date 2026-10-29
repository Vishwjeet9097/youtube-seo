import type { TermAggregate, TrendSnapshot, TrendStatus, VideoRecord } from "@/types/research";

export type Timeframe = "24h" | "48h" | "7d" | "28d" | "custom";

const WINDOW_MS: Record<Exclude<Timeframe, "custom">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "48h": 48 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "28d": 28 * 24 * 60 * 60 * 1000,
};

export function getWindowRange(
  timeframe: Timeframe,
  now = new Date(),
  custom?: { start: string; end: string },
): { start: Date; end: Date } {
  const end = new Date(now);
  if (Number.isNaN(end.getTime())) throw new Error("Invalid current timestamp.");
  if (timeframe === "custom") {
    if (!custom) throw new Error("Custom start and end timestamps are required.");
    const start = new Date(custom.start);
    const customEnd = new Date(custom.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(customEnd.getTime())) {
      throw new Error("Custom date range contains an invalid timestamp.");
    }
    if (start >= customEnd) throw new Error("Custom start must be before custom end.");
    if (customEnd > end) throw new Error("Custom end cannot be in the future.");
    if (customEnd.getTime() - start.getTime() > 90 * 24 * 60 * 60 * 1000) {
      throw new Error("Custom ranges are limited to 90 days.");
    }
    return { start, end: customEnd };
  }
  return { start: new Date(end.getTime() - WINDOW_MS[timeframe]), end };
}

export function isTimestampInWindow(value: string, start: Date, end: Date): boolean {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  return timestamp >= start.getTime() && timestamp <= end.getTime();
}

export function parseIsoDurationSeconds(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const match = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/u);
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? null);
}

export interface TrendComparison {
  status: TrendStatus;
  changePercent: number | null;
  explanation: string;
}

export function compareObservationCounts(current: number, previous: number | null): TrendComparison {
  if (previous === null) {
    return {
      status: "new_observation",
      changePercent: null,
      explanation: "Insufficient historical observations to calculate growth.",
    };
  }
  if (previous === 0) {
    return current > 0
      ? { status: "new_observation", changePercent: null, explanation: "The term was absent in the prior comparable snapshot." }
      : { status: "stable", changePercent: 0, explanation: "No observations in either comparable snapshot." };
  }
  const changePercent = ((current - previous) / previous) * 100;
  const rounded = Math.round(changePercent * 10) / 10;
  if (changePercent > 5) return { status: "rising", changePercent: rounded, explanation: "Observed video frequency rose by more than 5% between comparable local snapshots." };
  if (changePercent < -5) return { status: "falling", changePercent: rounded, explanation: "Observed video frequency fell by more than 5% between comparable local snapshots." };
  return { status: "stable", changePercent: rounded, explanation: "Observed video frequency changed by no more than 5% between comparable local snapshots." };
}

export function compareObservationPrevalence(
  currentCount: number,
  currentSampleSize: number,
  previousCount: number | null,
  previousSampleSize: number | null,
): TrendComparison {
  if (previousCount === null || previousSampleSize === null) {
    return { status: "new_observation", changePercent: null, explanation: "No matching earlier snapshot is available. Run the same analysis again later to compare the term's share of sampled videos." };
  }
  if (currentSampleSize <= 0 || previousSampleSize <= 0) {
    return { status: "unavailable", changePercent: null, explanation: "One matching snapshot has no sampled videos, so the change in the term's share cannot be calculated. Run the same analysis again later." };
  }
  const currentShare = currentCount / currentSampleSize;
  const previousShare = previousCount / previousSampleSize;
  if (previousShare === 0) {
    return currentShare > 0
      ? { status: "new_observation", changePercent: null, explanation: `The term appears in ${currentCount} of ${currentSampleSize} sampled videos now and appeared in 0 of ${previousSampleSize} in the matching earlier snapshot. This is a new observation, not measured growth.` }
      : { status: "stable", changePercent: 0, explanation: "The term appeared in no sampled videos in either matching snapshot, so its share is stable." };
  }
  const relativeChange = ((currentShare - previousShare) / previousShare) * 100;
  const rounded = Math.round(relativeChange * 10) / 10;
  const context = `${currentCount}/${currentSampleSize} sampled videos now (${formatPercent(currentShare)}) versus ${previousCount}/${previousSampleSize} in the matching earlier snapshot (${formatPercent(previousShare)})`;
  if (relativeChange > 5) return { status: "rising", changePercent: rounded, explanation: `The term's share of sampled videos rose by more than 5% relative to the earlier share: ${context}.` };
  if (relativeChange < -5) return { status: "falling", changePercent: rounded, explanation: `The term's share of sampled videos fell by more than 5% relative to the earlier share: ${context}.` };
  return { status: "stable", changePercent: rounded, explanation: `The term's share of sampled videos changed by no more than 5% relative to the earlier share: ${context}.` };
}

export function applyHistoricalComparison(
  aggregates: readonly TermAggregate[],
  fingerprint: string,
  snapshots: readonly TrendSnapshot[],
  kind: "tags" | "hashtags" | "titleKeywords" | "titlePhrases",
  currentRetrievedAt?: string,
  currentVideos: readonly VideoRecord[] = [],
): TermAggregate[] {
  const currentObservation = currentRetrievedAt ?? aggregates[0]?.lastObservedAt;
  const previous = [...snapshots]
    .filter((snapshot) => snapshot.fingerprint === fingerprint)
    .filter((snapshot) => !currentObservation || snapshot.result.retrievedAt !== currentObservation)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
  if (!previous) {
    return aggregates.map((aggregate) => ({
      ...aggregate,
      ...comparisonFields(compareObservationPrevalence(aggregate.distinctVideoCount, aggregate.sampleSize, null, null)),
      baselineVideoCount: null,
      baselineSampleSize: null,
      baselinePrevalence: null,
      baselineObservedAt: null,
      viewGrowthPercent: null,
      viewGrowthVideoCount: 0,
      viewGrowthExplanation: "No matching earlier snapshot is available. Run the same analysis again later to measure public view changes for the same videos. Views do not measure search demand.",
    }));
  }
  const previousMap = new Map(previous.result[kind].map((item) => [item.normalizedTerm, item]));
  return aggregates.map((aggregate) => {
    const previousAggregate = previousMap.get(aggregate.normalizedTerm);
    const viewGrowth = compareSameVideoViews(aggregate, previousAggregate, currentVideos, previous.result.videos);
    return {
      ...aggregate,
      ...comparisonFields(compareObservationPrevalence(
        aggregate.distinctVideoCount,
        aggregate.sampleSize,
        previousAggregate?.distinctVideoCount ?? 0,
        previous.result.sampleSize,
      )),
      currentPrevalence: aggregate.sampleSize > 0 ? aggregate.distinctVideoCount / aggregate.sampleSize : null,
      baselineVideoCount: previousAggregate?.distinctVideoCount ?? 0,
      baselineSampleSize: previous.result.sampleSize,
      baselinePrevalence: previous.result.sampleSize > 0 ? (previousAggregate?.distinctVideoCount ?? 0) / previous.result.sampleSize : null,
      baselineObservedAt: previous.result.retrievedAt,
      firstObservedAt: earliestTimestamp(aggregate.firstObservedAt, previousAggregate?.firstObservedAt),
      lastObservedAt: latestTimestamp(aggregate.lastObservedAt, previousAggregate?.lastObservedAt),
      ...viewGrowth,
    };
  });
}

function comparisonFields(comparison: TrendComparison): Pick<TermAggregate, "trendStatus" | "trendChangePercent" | "trendExplanation"> {
  return {
    trendStatus: comparison.status,
    trendChangePercent: comparison.changePercent,
    trendExplanation: comparison.explanation,
  };
}

function compareSameVideoViews(
  currentAggregate: TermAggregate,
  previousAggregate: TermAggregate | undefined,
  currentVideos: readonly VideoRecord[],
  previousVideos: readonly VideoRecord[],
): Pick<TermAggregate, "viewGrowthPercent" | "viewGrowthVideoCount" | "viewGrowthExplanation"> {
  if (!previousAggregate || currentVideos.length === 0) {
    return { viewGrowthPercent: null, viewGrowthVideoCount: 0, viewGrowthExplanation: "Public view change needs the same video with view counts in both snapshots. Run the same analysis again later; views do not measure search demand." };
  }
  const currentIds = new Set(currentAggregate.evidence.map((item) => item.videoId).filter((id): id is string => Boolean(id)));
  const previousIds = new Set(previousAggregate.evidence.map((item) => item.videoId).filter((id): id is string => Boolean(id)));
  const currentViews = new Map(currentVideos.map((video) => [video.id, video.statistics.viewCount]));
  const previousViews = new Map(previousVideos.map((video) => [video.id, video.statistics.viewCount]));
  const pairs = [...currentIds]
    .filter((id) => previousIds.has(id))
    .map((id) => [currentViews.get(id), previousViews.get(id)] as const)
    .filter((pair): pair is readonly [number, number] => pair[0] !== null && pair[0] !== undefined && pair[1] !== null && pair[1] !== undefined && pair[1] > 0);
  if (pairs.length === 0) {
    return { viewGrowthPercent: null, viewGrowthVideoCount: 0, viewGrowthExplanation: "No same video had public view counts in both matching snapshots, so view change cannot be calculated. Run the same analysis again later; views do not measure search demand." };
  }
  const currentTotal = pairs.reduce((sum, [current]) => sum + current, 0);
  const previousTotal = pairs.reduce((sum, [, prior]) => sum + prior, 0);
  const percent = Math.round((((currentTotal - previousTotal) / previousTotal) * 100) * 10) / 10;
  return {
    viewGrowthPercent: percent,
    viewGrowthVideoCount: pairs.length,
    viewGrowthExplanation: `Measured from ${pairs.length} same-video pair${pairs.length === 1 ? "" : "s"} with public view counts in both snapshots. This is view change, not search demand.`,
  };
}

function earliestTimestamp(current: string, previous: string | undefined): string {
  return previous && previous < current ? previous : current;
}

function latestTimestamp(current: string, previous: string | undefined): string {
  return previous && previous > current ? previous : current;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 1_000) / 10}%`;
}
