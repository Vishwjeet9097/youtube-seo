import { z } from "zod";
import { externalDataCache } from "@/lib/api/cache";
import { AppError } from "@/lib/api/errors";
import { fetchValidatedJson } from "@/lib/api/http";
import type {
  PopularVideoOptions,
  ProviderResult,
  ProviderStatus,
  VideoDataProvider,
  VideoSearchOptions,
} from "@/lib/providers/types";
import { extractHashtags } from "@/lib/text";
import { parseIsoDurationSeconds } from "@/lib/time";
import { isValidChannelId, isValidVideoId, youtubeVideoUrl } from "@/lib/youtube-url";
import type { VideoRecord } from "@/types/research";

let quotaBlockedUntil = 0;

const countSchema = z.string().regex(/^\d+$/u).optional();
const thumbnailSchema = z.object({ url: z.string().url(), width: z.number().optional(), height: z.number().optional() }).passthrough();
const videoItemSchema = z.object({
  id: z.string(),
  snippet: z.object({
    publishedAt: z.string(),
    channelId: z.string(),
    title: z.string(),
    description: z.string().default(""),
    channelTitle: z.string(),
    tags: z.array(z.string()).optional(),
    categoryId: z.string().optional(),
    thumbnails: z.record(z.string(), thumbnailSchema).optional(),
  }).passthrough(),
  statistics: z.object({
    viewCount: countSchema,
    likeCount: countSchema,
    commentCount: countSchema,
  }).passthrough().optional(),
  contentDetails: z.object({ duration: z.string().optional() }).passthrough().optional(),
}).passthrough();
const videoListSchema = z.object({ items: z.array(videoItemSchema).default([]) }).passthrough();
const searchListSchema = z.object({
  items: z.array(z.object({ id: z.object({ videoId: z.string().optional() }).passthrough() }).passthrough()).default([]),
}).passthrough();
const channelListSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string().optional() }).passthrough() }).passthrough(),
  }).passthrough()).default([]),
}).passthrough();
const playlistItemsSchema = z.object({
  items: z.array(z.object({ contentDetails: z.object({ videoId: z.string() }).passthrough() }).passthrough()).default([]),
}).passthrough();

type YouTubeVideoItem = z.infer<typeof videoItemSchema>;

interface RawLookup<T> {
  data: T;
  retrievedAt: string;
  cached: boolean;
  cacheAgeSeconds: number | null;
}

export class YouTubeDataProvider implements VideoDataProvider {
  readonly status: ProviderStatus;
  private readonly apiKey: string | undefined;

  constructor(apiKey = process.env.YOUTUBE_API_KEY) {
    this.apiKey = apiKey?.trim() || undefined;
    this.status = {
      id: "youtube-data-api",
      name: "YouTube Data API v3",
      configured: Boolean(this.apiKey),
      live: Boolean(this.apiKey),
      supplies: [
        "Public video and channel details",
        "Public tags added by uploaders",
        "Publication time, duration, and available public view, like, and comment counts",
        "Samples of public videos returned for a topic and the current regional popular chart",
      ],
      limitation: this.apiKey
        ? "Results are a limited sample of public videos available now, not all YouTube videos or a record of viewer searches. Appearing in the sample is not a search, views do not measure search demand, the current popular chart cannot show earlier charts, and short-video labels are estimates based on duration."
        : "Live YouTube results are unavailable because the data source is not set up correctly. Contact the app administrator.",
    };
  }

  async listVideos(ids: readonly string[], region: string | null = null): Promise<ProviderResult<VideoRecord[]>> {
    this.assertConfigured();
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(isValidVideoId))];
    if (uniqueIds.length === 0) return this.emptyResult();
    if (uniqueIds.length > 50) throw new AppError("BATCH_TOO_LARGE", "You can check up to 50 video IDs at once. Remove extra IDs and try again.", 400, false);

    const lookup = await this.request(
      "/youtube/v3/videos",
      {
        part: "snippet,statistics,contentDetails",
        id: uniqueIds.join(","),
        maxResults: String(uniqueIds.length),
      },
      videoListSchema,
      15 * 60_000,
    );
    const records = lookup.data.items.map((item) => this.toVideoRecord(item, lookup.retrievedAt, region));
    return { ...lookup, data: records, warnings: [] };
  }

  async searchVideos(options: VideoSearchOptions): Promise<ProviderResult<VideoRecord[]>> {
    this.assertConfigured();
    const search = await this.request(
      "/youtube/v3/search",
      {
        part: "snippet",
        type: "video",
        q: options.query,
        regionCode: options.region,
        maxResults: String(Math.min(50, options.maxResults)),
        order: options.order,
        safeSearch: "moderate",
        ...(options.language ? { relevanceLanguage: options.language } : {}),
        ...(options.publishedAfter ? { publishedAfter: options.publishedAfter } : {}),
        ...(options.publishedBefore ? { publishedBefore: options.publishedBefore } : {}),
        ...(options.categoryId ? { videoCategoryId: options.categoryId } : {}),
      },
      searchListSchema,
      5 * 60_000,
    );
    const ids = search.data.items
      .map((item) => item.id.videoId)
      .filter((id): id is string => Boolean(id && isValidVideoId(id)));
    const videos = await this.listVideos(ids, options.region);
    return {
      data: videos.data,
      retrievedAt: videos.retrievedAt,
      cached: search.cached && videos.cached,
      cacheAgeSeconds: search.cached && videos.cached
        ? Math.min(search.cacheAgeSeconds ?? 0, videos.cacheAgeSeconds ?? 0)
        : null,
      warnings: ids.length === 0
        ? ["No public videos appeared in this result sample for the selected query and filters. Try broader filters or a different query."]
        : [],
    };
  }

  async popularVideos(options: PopularVideoOptions): Promise<ProviderResult<VideoRecord[]>> {
    this.assertConfigured();
    const lookup = await this.request(
      "/youtube/v3/videos",
      {
        part: "snippet,statistics,contentDetails",
        chart: "mostPopular",
        regionCode: options.region,
        maxResults: String(Math.min(50, options.maxResults)),
        ...(options.categoryId ? { videoCategoryId: options.categoryId } : {}),
      },
      videoListSchema,
      10 * 60_000,
    );
    return {
      ...lookup,
      data: lookup.data.items.map((item) => this.toVideoRecord(item, lookup.retrievedAt, options.region)),
      warnings: ["This is a limited sample of the current popular chart for this region, not chart history or all of YouTube."],
    };
  }

  async channelVideos(
    reference: { id?: string | null; handle?: string | null; legacyName?: string | null },
    limit: number,
  ): Promise<ProviderResult<VideoRecord[]>> {
    this.assertConfigured();
    const resolved = await this.resolveChannel(reference);
    const channel = resolved.data.items[0];
    const uploads = channel?.contentDetails.relatedPlaylists.uploads;
    if (!channel || !uploads) {
      throw new AppError("CHANNEL_NOT_FOUND", "We couldn't find the public channel and its uploads. Check the channel URL or handle and try again.", 404, false);
    }
    const playlist = await this.request(
      "/youtube/v3/playlistItems",
      {
        part: "contentDetails",
        playlistId: uploads,
        maxResults: String(Math.min(50, Math.max(1, limit))),
      },
      playlistItemsSchema,
      10 * 60_000,
    );
    const ids = playlist.data.items.map((item) => item.contentDetails.videoId).filter(isValidVideoId);
    const videos = await this.listVideos(ids);
    return {
      data: videos.data,
      retrievedAt: videos.retrievedAt,
      cached: resolved.cached && playlist.cached && videos.cached,
      cacheAgeSeconds: resolved.cached && playlist.cached && videos.cached
        ? Math.min(resolved.cacheAgeSeconds ?? 0, playlist.cacheAgeSeconds ?? 0, videos.cacheAgeSeconds ?? 0)
        : null,
      warnings: videos.data.length < limit
        ? [`Only ${videos.data.length} recent public uploads were available for this channel, fewer than requested. Treat these results as a partial sample.`]
        : [],
    };
  }

  private async resolveChannel(reference: { id?: string | null; handle?: string | null; legacyName?: string | null }) {
    const parameters: Record<string, string> = { part: "contentDetails" };
    if (reference.id && isValidChannelId(reference.id)) parameters.id = reference.id;
    else if (reference.handle) parameters.forHandle = reference.handle.replace(/^@/u, "");
    else if (reference.legacyName) parameters.forUsername = reference.legacyName;
    else throw new AppError("INVALID_CHANNEL", "Enter a YouTube channel ID, @handle, or supported channel URL, then try again.", 400, false);
    return this.request("/youtube/v3/channels", parameters, channelListSchema, 60 * 60_000);
  }

  private toVideoRecord(item: YouTubeVideoItem, observedAt: string, region: string | null): VideoRecord {
    const tags = item.snippet.tags ?? [];
    return {
      id: item.id,
      url: youtubeVideoUrl(item.id),
      title: item.snippet.title,
      description: item.snippet.description,
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      thumbnailUrl: selectThumbnail(item.snippet.thumbnails),
      tags,
      tagStatus: tags.length > 0 ? "found" : "empty",
      hashtags: {
        title: extractHashtags(item.snippet.title),
        description: extractHashtags(item.snippet.description),
      },
      statistics: {
        viewCount: parseCount(item.statistics?.viewCount),
        likeCount: parseCount(item.statistics?.likeCount),
        commentCount: parseCount(item.statistics?.commentCount),
      },
      durationSeconds: parseIsoDurationSeconds(item.contentDetails?.duration),
      categoryId: item.snippet.categoryId ?? null,
      observedAt,
      region,
    };
  }

  private async request<T>(
    path: string,
    parameters: Record<string, string>,
    schema: z.ZodType<T>,
    ttlMs: number,
  ): Promise<RawLookup<T>> {
    this.assertConfigured();
    if (Date.now() < quotaBlockedUntil) {
      throw new AppError("YOUTUBE_QUOTA_EXCEEDED", "YouTube's daily request limit has been reached. Try again after the next UTC reset.", 429, false);
    }
    const safeParameters = new URLSearchParams(parameters);
    const cacheKey = `youtube:${path}?${safeParameters.toString()}`;
    const url = new URL(path, "https://www.googleapis.com");
    url.search = safeParameters.toString();
    url.searchParams.set("key", this.apiKey!);
    const lookup = await externalDataCache.getOrSet(cacheKey, ttlMs, async () => {
      try {
        return await fetchValidatedJson(url, schema);
      } catch (error) {
        if (error instanceof AppError && error.code === "YOUTUBE_QUOTA_EXCEEDED") quotaBlockedUntil = nextUtcMidnight();
        throw error;
      }
    });
    return {
      data: lookup.value,
      retrievedAt: new Date(lookup.storedAt).toISOString(),
      cached: lookup.cached,
      cacheAgeSeconds: lookup.cached ? Math.max(0, Math.floor((Date.now() - lookup.storedAt) / 1000)) : null,
    };
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new AppError(
        "YOUTUBE_NOT_CONFIGURED",
        "Live YouTube results are unavailable because the data source is not set up correctly. Contact the app administrator.",
        503,
        false,
      );
    }
  }

  private emptyResult<T>(): ProviderResult<T[]> {
    return { data: [], retrievedAt: new Date().toISOString(), cached: false, cacheAgeSeconds: null, warnings: [] };
  }
}

function parseCount(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function selectThumbnail(thumbnails: Record<string, z.infer<typeof thumbnailSchema>> | undefined): string | null {
  if (!thumbnails) return null;
  for (const key of ["maxres", "standard", "high", "medium", "default"]) {
    const thumbnail = thumbnails[key];
    if (thumbnail?.url) return thumbnail.url;
  }
  return Object.values(thumbnails)[0]?.url ?? null;
}

function nextUtcMidnight(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}
