import { isAppError } from "@/lib/api/errors";
import type { VideoDataProvider } from "@/lib/providers/types";
import { parseYouTubeInput } from "@/lib/youtube-url";
import type { ExtractionError, ExtractionItem, VideoRecord } from "@/types/research";

const CHANNEL_CONCURRENCY = 2;

export async function extractYouTubeInputs(provider: VideoDataProvider, inputs: readonly string[], channelLimit: number): Promise<ExtractionItem[]> {
  const parsed = inputs.map(parseYouTubeInput);
  const directIds = [...new Set(parsed.filter((item) => item.kind === "video").map((item) => item.id))];
  let directVideos = new Map<string, VideoRecord>();
  let directError: ExtractionError | null = null;

  if (directIds.length > 0) {
    try {
      const result = await provider.listVideos(directIds);
      directVideos = new Map(result.data.map((video) => [video.id, video]));
    } catch (error) { directError = toExtractionError(error); }
  }

  return mapWithConcurrency(parsed, CHANNEL_CONCURRENCY, async (item): Promise<ExtractionItem> => {
    if (item.kind === "invalid") return { input: item.original, normalizedId: null, kind: "unknown", status: "failed", videos: [], error: { code: "INVALID_YOUTUBE_INPUT", message: item.reason, retryable: false } };
    if (item.kind === "video") {
      if (directError) return { input: item.original, normalizedId: item.id, kind: "video", status: "failed", videos: [], error: directError };
      const video = directVideos.get(item.id);
      if (!video) return { input: item.original, normalizedId: item.id, kind: "video", status: "failed", videos: [], error: { code: "VIDEO_UNAVAILABLE", message: "We couldn't access public details for this video. Check that the video is public and that the URL or ID is correct.", retryable: false } };
      return { input: item.original, normalizedId: item.id, kind: "video", status: "complete", videos: [video], error: null };
    }
    try {
      const result = await provider.channelVideos(item, channelLimit);
      return {
        input: item.original,
        normalizedId: item.id ?? item.handle ?? item.legacyName,
        kind: "channel",
        status: result.data.length > 0 ? "complete" : "partial",
        videos: result.data,
        error: result.data.length > 0 ? null : { code: "NO_ACCESSIBLE_UPLOADS", message: "We found the channel, but no recent public uploads were available. Check that the channel has public videos or try another channel.", retryable: false },
      };
    } catch (error) {
      return { input: item.original, normalizedId: item.id ?? item.handle ?? item.legacyName, kind: "channel", status: "failed", videos: [], error: toExtractionError(error) };
    }
  });
}

async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function toExtractionError(error: unknown): ExtractionError {
  if (isAppError(error)) return { code: error.code, message: error.message, retryable: error.retryable };
  return { code: "EXTRACTION_FAILED", message: error instanceof Error ? error.message : "We couldn't retrieve videos for this item because of an unexpected error. Try again.", retryable: true };
}
