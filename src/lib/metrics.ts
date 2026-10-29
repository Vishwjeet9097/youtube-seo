import { extractTitleTerms, normalizeForMatch } from "@/lib/text";
import { median } from "@/lib/time";
import type { SourceEvidence, SourceType, TermAggregate, VideoRecord } from "@/types/research";

interface AggregateAccumulator {
  label: string;
  normalized: string;
  videoIds: Set<string>;
  channelIds: Set<string>;
  observationCount: number;
  views: number[];
  publishedAt: string[];
  observedAt: string[];
  evidence: SourceEvidence[];
}

function evidenceFor(video: VideoRecord, sourceType: SourceType, detail: string): SourceEvidence {
  return {
    id: `${video.id}:${normalizeForMatch(detail)}`,
    sourceType,
    sourceName: sourceType === "youtube_popular" ? "YouTube popular chart" : "YouTube Data API v3",
    sourceUrl: video.url,
    observedAt: video.observedAt,
    region: video.region,
    language: null,
    videoId: video.id,
    channelId: video.channelId,
    detail,
  };
}

export function aggregateVideoTerms(
  videos: readonly VideoRecord[],
  kind: TermAggregate["kind"],
  sourceType: "youtube_search" | "youtube_popular",
  region: string | null,
): TermAggregate[] {
  const map = new Map<string, AggregateAccumulator>();

  for (const video of videos) {
    const titleTerms = extractTitleTerms(video.title);
    const values = kind === "tag"
      ? (video.tags ?? [])
      : kind === "hashtag"
        ? [...video.hashtags.title, ...video.hashtags.description]
        : kind === "title_phrase"
          ? titleTerms.phrases
          : titleTerms.keywords;
    const seenInVideo = new Set<string>();

    for (const rawValue of values) {
      const label = rawValue.trim();
      const normalized = normalizeForMatch(kind === "hashtag" ? label.replace(/^#/u, "") : label);
      if (!normalized) continue;
      let item = map.get(normalized);
      if (!item) {
        item = {
          label,
          normalized,
          videoIds: new Set(),
          channelIds: new Set(),
          observationCount: 0,
          views: [],
          publishedAt: [],
          observedAt: [],
          evidence: [],
        };
        map.set(normalized, item);
      }
      item.observationCount += 1;
      if (!seenInVideo.has(normalized)) {
        item.videoIds.add(video.id);
        item.channelIds.add(video.channelId);
        if (video.statistics.viewCount !== null) item.views.push(video.statistics.viewCount);
        item.publishedAt.push(video.publishedAt);
        item.observedAt.push(video.observedAt);
        if (item.evidence.length < 25) item.evidence.push(evidenceFor(video, sourceType, label));
        seenInVideo.add(normalized);
      }
    }
  }

  return [...map.values()]
    .map((item): TermAggregate => ({
      term: item.label,
      normalizedTerm: item.normalized,
      kind,
      distinctVideoCount: item.videoIds.size,
      distinctChannelCount: item.channelIds.size,
      observationCount: item.observationCount,
      currentPrevalence: videos.length > 0 ? item.videoIds.size / videos.length : null,
      baselineVideoCount: null,
      baselineSampleSize: null,
      baselinePrevalence: null,
      baselineObservedAt: null,
      averageViews: item.views.length > 0 ? Math.round(item.views.reduce((sum, value) => sum + value, 0) / item.views.length) : null,
      medianViews: median(item.views),
      firstPublishedAt: [...item.publishedAt].sort()[0] ?? "",
      lastPublishedAt: [...item.publishedAt].sort().at(-1) ?? "",
      firstObservedAt: [...item.observedAt].sort()[0] ?? "",
      lastObservedAt: [...item.observedAt].sort().at(-1) ?? "",
      region,
      sampleSize: videos.length,
      sourceType,
      sourceName: sourceType === "youtube_popular" ? "YouTube popular chart sample" : "YouTube search sample",
      evidence: item.evidence,
      trendStatus: "new_observation",
      trendChangePercent: null,
      trendExplanation: "No matching earlier snapshot is available. Run the same analysis again later to compare the term's share of sampled videos.",
      viewGrowthPercent: null,
      viewGrowthVideoCount: 0,
      viewGrowthExplanation: "No matching earlier snapshot is available. Run the same analysis again later to measure public view changes for the same videos. Views do not measure search demand.",
    }))
    .sort((left, right) => right.distinctVideoCount - left.distinctVideoCount || (right.averageViews ?? -1) - (left.averageViews ?? -1));
}
