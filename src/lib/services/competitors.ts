import { AppError } from "@/lib/api/errors";
import type { VideoDataProvider } from "@/lib/providers/types";
import { extractYouTubeInputs } from "@/lib/services/extraction";
import { extractTitleTerms, normalizeForMatch } from "@/lib/text";
import type { CompetitorComparison, TagComparisonVideo, VideoRecord } from "@/types/research";

export async function compareCompetitors(
  provider: VideoDataProvider,
  inputs: readonly string[],
  referenceIndex: number,
  channelLimit: number,
): Promise<CompetitorComparison> {
  const extraction = await extractYouTubeInputs(provider, inputs, channelLimit);
  const selectedReference = extraction[referenceIndex]?.videos[0];
  if (!selectedReference) {
    throw new AppError(
      "REFERENCE_UNAVAILABLE",
      "We couldn't access a public video for the selected reference. Choose another public reference and try again; no other video was substituted.",
      422,
      false,
    );
  }
  const videos = extraction.flatMap((item) => item.videos);
  if (videos.length < 2) {
    throw new AppError("INSUFFICIENT_COMPARISON", "Add at least two public videos we can access, then run the comparison again.", 422, false);
  }
  const comparisonVideos = videos.map(toComparisonVideo);
  const warnings = extraction.filter((item) => item.error).map((item) => `Skipped ${item.input}: ${item.error!.message}`);
  if (videos.some((video) => video.tagStatus === "empty")) {
    warnings.push("Some videos do not publish uploader-added tags, so their tag lists are empty. Title words were not used as tags; try other public videos for a fuller comparison.");
  }

  const tagSets = comparisonVideos.map((item) => new Set(Object.keys(item.normalizedTags)));
  const commonTagKeys = intersection(tagSets);
  const referenceTags = new Set(Object.keys(toComparisonVideo(selectedReference).normalizedTags));
  const allTagLabels = collectLabels(comparisonVideos);
  const missingKeys = new Set<string>();
  for (const keys of tagSets) for (const key of keys) if (!referenceTags.has(key)) missingKeys.add(key);

  return {
    specification: { inputs: [...inputs], referenceIndex, channelLimit },
    retrievedAt: videos.map((video) => video.observedAt).sort().at(-1) ?? new Date().toISOString(),
    referenceVideoId: selectedReference.id,
    sampleSize: videos.length,
    videos: comparisonVideos,
    commonTags: commonTagKeys.map((key) => allTagLabels.get(key) ?? key),
    tagsByVideo: Object.fromEntries(comparisonVideos.map((item) => [item.video.id, Object.values(item.normalizedTags)])),
    missingFromReference: [...missingKeys].map((key) => allTagLabels.get(key) ?? key),
    commonTitleKeywords: intersection(comparisonVideos.map((item) => new Set(item.titleKeywords.map(normalizeForMatch)))),
    commonHashtags: intersection(
      comparisonVideos.map((item) => new Set(item.hashtags.map((tag) => normalizeForMatch(tag.replace(/^#/u, ""))))),
    ).map((tag) => `#${tag}`),
    warnings: [...new Set(warnings)],
  };
}

function toComparisonVideo(video: VideoRecord): TagComparisonVideo {
  const normalizedTags: Record<string, string> = {};
  for (const tag of video.tags ?? []) {
    const key = normalizeForMatch(tag);
    if (key && !(key in normalizedTags)) normalizedTags[key] = tag;
  }
  return {
    video,
    normalizedTags,
    titleKeywords: extractTitleTerms(video.title).keywords,
    hashtags: [...new Set([...video.hashtags.title, ...video.hashtags.description])],
  };
}

function intersection(sets: readonly Set<string>[]): string[] {
  if (sets.length === 0) return [];
  return [...sets[0]!].filter((value) => sets.every((set) => set.has(value))).sort();
}

function collectLabels(videos: readonly TagComparisonVideo[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const item of videos) for (const [key, label] of Object.entries(item.normalizedTags)) if (!labels.has(key)) labels.set(key, label);
  return labels;
}
