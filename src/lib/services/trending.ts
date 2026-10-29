import { aggregateVideoTerms } from "@/lib/metrics";
import type { VideoDataProvider } from "@/lib/providers/types";
import type { TrendingRequest } from "@/lib/schemas";
import { getWindowRange, isTimestampInWindow } from "@/lib/time";
import type { TrendResult, VideoRecord } from "@/types/research";

export async function discoverTrends(
  youtube: VideoDataProvider,
  request: TrendingRequest,
  now = new Date(),
): Promise<TrendResult> {
  const range = getWindowRange(
    request.timeframe,
    now,
    request.timeframe === "custom" ? { start: request.customStart!, end: request.customEnd! } : undefined,
  );
  const source = request.query ? "youtube_search" as const : "youtube_popular" as const;
  const providerResult = request.query
    ? await youtube.searchVideos({
        query: request.query,
        region: request.region,
        language: request.language,
        publishedAfter: range.start.toISOString(),
        publishedBefore: range.end.toISOString(),
        maxResults: request.maxResults,
        order: request.order,
        categoryId: request.categoryId,
      })
    : await youtube.popularVideos({
        region: request.region,
        maxResults: request.maxResults,
        categoryId: request.categoryId,
      });

  const warnings = [...providerResult.warnings];
  let videos = providerResult.data.filter((video) => isTimestampInWindow(video.publishedAt, range.start, range.end));
  if (!request.query) {
    warnings.push("The publication-date filter narrows the current popular-chart sample; it does not change when the chart was captured.");
  }
  if (request.contentType !== "all") {
    const before = videos.length;
    const selectedContentType: "short" | "long" = request.contentType;
    videos = videos.filter((video) => matchesContentType(video, selectedContentType));
    warnings.push("Short videos are estimated from duration: up to 180 seconds is short, and longer is long. This may not match YouTube’s Shorts label; videos without a duration are excluded.");
    if (videos.length < before) warnings.push(`The duration filter excluded ${before - videos.length} videos. Choose All to include them.`);
  }

  return {
    specification: {
      query: request.query ?? null,
      region: request.region,
      language: request.language ?? null,
      timeframe: request.timeframe,
      customStart: request.customStart ?? null,
      customEnd: request.customEnd ?? null,
      categoryId: request.categoryId ?? null,
      order: request.order,
      contentType: request.contentType,
      maxResults: request.maxResults,
      discoveryMethod: source,
    },
    query: request.query ?? null,
    region: request.region,
    language: request.language ?? null,
    timeframe: request.timeframe,
    windowStart: range.start.toISOString(),
    windowEnd: range.end.toISOString(),
    retrievedAt: providerResult.retrievedAt,
    sampleSize: videos.length,
    discoveryMethod: source,
    videos,
    tags: aggregateVideoTerms(videos, "tag", source, request.region),
    hashtags: aggregateVideoTerms(videos, "hashtag", source, request.region),
    titleKeywords: aggregateVideoTerms(videos, "title_keyword", source, request.region),
    titlePhrases: aggregateVideoTerms(videos, "title_phrase", source, request.region),
    warnings: [
      ...new Set([
        ...warnings,
        "Trend labels require a matching earlier snapshot. Save this result, then repeat the analysis later. Rising, stable, and falling compare each term’s share of sampled videos.",
        "Views apply only to sampled videos; they do not measure search demand.",
      ]),
    ],
  };
}

function matchesContentType(video: VideoRecord, contentType: "short" | "long"): boolean {
  if (video.durationSeconds === null) return false;
  return contentType === "short" ? video.durationSeconds <= 180 : video.durationSeconds > 180;
}
