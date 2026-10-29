import { z } from "zod";
import { AppError } from "@/lib/api/errors";
import { formatDuration } from "@/lib/format";
import { YouTubeDataProvider } from "@/lib/providers/youtube";
import { extractHashtags } from "@/lib/text";
import { isValidVideoId, parseYouTubeInput, youtubeVideoUrl } from "@/lib/youtube-url";
import type { VideoMetadataDetails } from "@/types/research";

const oembedSchema = z.object({
  title: z.string().default("YouTube Video"),
  author_name: z.string().default("YouTube Creator"),
  author_url: z.string().url().optional(),
  thumbnail_url: z.string().url().optional(),
  type: z.string().optional(),
  version: z.string().optional(),
}).passthrough();

export function extractVideoId(input: string): string {
  const parsed = parseYouTubeInput(input.trim());
  if (parsed.kind === "video") {
    return parsed.id;
  }
  if (isValidVideoId(input.trim())) {
    return input.trim();
  }
  throw new AppError(
    "INVALID_YOUTUBE_URL",
    parsed.kind === "invalid" ? parsed.reason : "Provide a YouTube video link or 11-character video ID, not a channel link.",
    400,
    false,
  );
}

export async function fetchVideoMetadata(input: string): Promise<VideoMetadataDetails> {
  const videoId = extractVideoId(input);
  const videoUrl = youtubeVideoUrl(videoId);

  // 1. Try YouTube Data API v3 if API key is configured
  if (process.env.YOUTUBE_API_KEY?.trim()) {
    try {
      const provider = new YouTubeDataProvider();
      const result = await provider.listVideos([videoId]);
      const item = result.data.find((v) => v.id === videoId);
      if (item) {
        const hashtags = [
          ...(item.hashtags?.title ?? []),
          ...(item.hashtags?.description ?? []),
        ];
        return {
          id: item.id,
          url: item.url,
          title: item.title,
          channelTitle: item.channelTitle,
          channelUrl: item.channelId ? `https://www.youtube.com/channel/${item.channelId}` : null,
          thumbnailUrl: item.thumbnailUrl ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          durationSeconds: item.durationSeconds,
          durationFormatted: item.durationSeconds !== null ? formatDuration(item.durationSeconds) : null,
          publishedAt: item.publishedAt,
          viewCount: item.statistics.viewCount,
          description: item.description || null,
          tags: item.tags ?? [],
          hashtags: Array.from(new Set(hashtags)),
        };
      }
    } catch {
      // Fall through to public oEmbed
    }
  }

  // 2. Fallback to public YouTube oEmbed (fast, reliable, requires no API key)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(oembedUrl, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "SourceLens/1.0",
      },
      cache: "no-store",
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      if (response.status === 404 || response.status === 400) {
        throw new AppError(
          "VIDEO_NOT_FOUND",
          "Video not found or unavailable. Please verify the link or video ID.",
          404,
          false,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new AppError(
          "VIDEO_RESTRICTED",
          "This video is private, restricted, or embedding is disabled.",
          403,
          false,
        );
      }
      throw new AppError("METADATA_FETCH_FAILED", "Failed to retrieve video details from YouTube.", 502, true);
    }

    const json: unknown = await response.json();
    const parsed = oembedSchema.safeParse(json);
    if (!parsed.success) {
      throw new AppError("INVALID_METADATA", "YouTube returned invalid metadata format.", 502, false);
    }

    const data = parsed.data;
    const title = data.title;
    return {
      id: videoId,
      url: videoUrl,
      title,
      channelTitle: data.author_name,
      channelUrl: data.author_url ?? null,
      thumbnailUrl: data.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      durationSeconds: null,
      durationFormatted: null,
      publishedAt: null,
      viewCount: null,
      description: null,
      tags: [],
      hashtags: extractHashtags(title),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("METADATA_TIMEOUT", "Metadata request timed out. Please try again.", 504, true);
    }
    throw new AppError(
      "VIDEO_UNAVAILABLE",
      "We couldn't access public details for this video. Check that the video is public and that the URL or ID is correct.",
      404,
      false,
    );
  }
}
