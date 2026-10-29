import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript";
import { AppError } from "@/lib/api/errors";
import { fetchVideoMetadata } from "@/lib/services/metadata";
import { translateTranscript } from "@/lib/services/translation";
import {
  LANGUAGE_NAMES,
  detectLanguageFromContent,
  discoverCaptionTracks,
  fetchTranscriptFromUrl,
  getLanguageDisplayName,
  normalizeLanguageCode,
  selectBestCaptionTrack,
  type DiscoveredCaptionTrack,
  type RawTranscriptSegment,
} from "@/lib/services/youtube-captions";
import {
  cleanTranscriptText,
  stripTimestampMarkers,
} from "@/lib/services/transcript-cleaner";
import {
  formatTimestamp,
  formatTranscriptIntoParagraphs,
  normalizeSegments,
  serializeTranscript,
} from "@/lib/services/transcript-formatting";
import {
  isSpeechToTextConfigured,
  transcribeWithSpeechToText,
} from "@/lib/services/speech-to-text";
import { dedupePreservingOriginal, extractHashtags } from "@/lib/text";
import { transcriptDataCache } from "@/lib/services/transcript-cache";
import type { CaptionTrackInfo, TranscriptPayload } from "@/types/research";

export {
  LANGUAGE_NAMES,
  cleanTranscriptText,
  stripTimestampMarkers,
  formatTimestamp,
  formatTranscriptIntoParagraphs,
  normalizeSegments,
  serializeTranscript,
};

/**
 * Backward-compatible helper for detecting language from text.
 */
export function detectLanguageFromText(
  text: string,
  fallbackLang = "en",
): { code: string; name: string } {
  const result = detectLanguageFromContent(text);
  if (result.isConfident && result.code !== "und") {
    return { code: result.code, name: result.name };
  }
  const cleanLang = normalizeLanguageCode(fallbackLang) || "en";
  return { code: cleanLang, name: LANGUAGE_NAMES[cleanLang] ?? "English" };
}

export interface FetchTranscriptOptions {
  lang?: string;
  trackLanguage?: string;
  outputLanguage?: string;
  customFetch?: typeof fetch;
  skipCache?: boolean;
}

/**
 * Primary transcript retrieval and language identification pipeline.
 * Deterministically retrieves native language captions (especially Hindi),
 * prevents incorrect English defaults, and separates source language from output language.
 */
export async function fetchVideoTranscript(
  input: string,
  options?: FetchTranscriptOptions,
): Promise<TranscriptPayload> {
  const metadata = await fetchVideoMetadata(input);
  const videoId = metadata.id;

  const preferredTrackLang = (options?.trackLanguage || options?.lang)?.trim();
  const targetOutputLang = options?.outputLanguage?.trim() || "original";
  const fetchFn = options?.customFetch ?? fetch;

  const cacheKeyParams = {
    videoId,
    captionTrackLanguage: preferredTrackLang,
    outputLanguage: targetOutputLang,
  };

  if (!options?.skipCache) {
    return transcriptDataCache.getOrSet(cacheKeyParams, 15 * 60_000, async () => {
      return executeFetchVideoTranscript(videoId, metadata, preferredTrackLang, targetOutputLang, fetchFn);
    });
  }

  return executeFetchVideoTranscript(videoId, metadata, preferredTrackLang, targetOutputLang, fetchFn);
}

async function executeFetchVideoTranscript(
  videoId: string,
  metadata: Awaited<ReturnType<typeof fetchVideoMetadata>>,
  preferredTrackLang: string | undefined,
  targetOutputLang: string,
  fetchFn: typeof fetch,
): Promise<TranscriptPayload> {
  try {
    let rawItems: RawTranscriptSegment[] = [];
    let selectedTrack: DiscoveredCaptionTrack | null = null;
    let availableTracks: DiscoveredCaptionTrack[] = [];
    let detectionMethod = "manual_caption_track";

    // 1. Discover available caption tracks directly from YouTube InnerTube / Web page
    const discovery = await discoverCaptionTracks(videoId, fetchFn);
    availableTracks = discovery.tracks;
    const defaultAudioLanguage = discovery.defaultAudioLanguage;

    // Enrich video metadata with tags and hashtags from discovery
    const finalTags =
      metadata.tags && metadata.tags.length > 0
        ? metadata.tags
        : discovery.keywords ?? [];

    const allHashtags = [
      ...(metadata.hashtags ?? []),
      ...extractHashtags(metadata.title || ""),
      ...extractHashtags(discovery.title || ""),
      ...extractHashtags(metadata.description || ""),
      ...extractHashtags(discovery.description || ""),
    ];
    const finalHashtags = dedupePreservingOriginal(allHashtags);

    metadata.tags = finalTags;
    metadata.hashtags = finalHashtags;
    if (!metadata.description && discovery.description) {
      metadata.description = discovery.description;
    }

    if (availableTracks.length > 0) {
      // Deterministically select the best caption track (prioritizing native Hindi over English translations)
      selectedTrack = selectBestCaptionTrack(availableTracks, {
        preferredLang: preferredTrackLang,
        defaultAudioLanguage,
        videoTitle: metadata.title,
        videoDescription: metadata.description ?? undefined,
      });

      if (selectedTrack) {
        try {
          rawItems = await fetchTranscriptFromUrl(selectedTrack.baseUrl, selectedTrack.languageCode, fetchFn);
        } catch {
          // If fetching selected track failed, keep rawItems empty to try fallback
          rawItems = [];
        }
      }
    }

    // 2. Fallback to youtube-transcript library (or spied mocks in unit tests)
    if (rawItems.length === 0) {
      try {
        const trackLangToFetch =
          preferredTrackLang ||
          selectedTrack?.languageCode ||
          (metadata.title && /[\u0900-\u097F]/u.test(metadata.title) ? "hi" : undefined);

        let ytTranscriptResult;
        try {
          ytTranscriptResult = await YoutubeTranscript.fetchTranscript(videoId, {
            lang: trackLangToFetch,
          });
        } catch (fetchErr) {
          // If fetching the specific language failed, and it was an auto-detected language, retry without lang
          if (fetchErr instanceof YoutubeTranscriptNotAvailableLanguageError && !preferredTrackLang) {
            ytTranscriptResult = await YoutubeTranscript.fetchTranscript(videoId);
          } else {
            throw fetchErr;
          }
        }

        if (ytTranscriptResult && ytTranscriptResult.length > 0) {
          rawItems = ytTranscriptResult.map((r) => ({
            text: r.text,
            offset: r.offset,
            duration: r.duration,
            lang: r.lang ?? trackLangToFetch,
          }));
        }
      } catch (err) {
        // If youtube-transcript threw a known error, we rethrow or handle below
        if (
          err instanceof YoutubeTranscriptDisabledError ||
          err instanceof YoutubeTranscriptVideoUnavailableError ||
          err instanceof YoutubeTranscriptTooManyRequestError
        ) {
          throw err;
        }
      }
    }

    // 3. Fallback to genuine speech-to-text with automatic language detection if no caption tracks exist
    if (rawItems.length === 0 && isSpeechToTextConfigured()) {
      try {
        const stt = await transcribeWithSpeechToText({
          videoId,
          preferredLanguage: preferredTrackLang && preferredTrackLang !== "original" ? preferredTrackLang : undefined,
        });
        if (stt.segments.length > 0) {
          const originalSegments = stt.segments;
          const originalFullText = stt.text;
          const sourceLanguage = normalizeLanguageCode(stt.detectedLanguage);
          const sourceLanguageName = stt.detectedLanguageName;

          return resolveOutputTranslation({
            videoId,
            metadata,
            originalSegments,
            originalFullText,
            sourceLanguage,
            sourceLanguageName,
            targetOutputLang,
            isAutomatic: true,
            isHumanCreated: false,
            availableLanguages: [sourceLanguage],
            captionTrackLanguage: null,
            languageDetectionMethod: "speech_to_text",
            isLanguageUncertain: false,
            availableCaptionTracks: [],
            preferredTrackLang,
            tags: metadata.tags ?? [],
            hashtags: metadata.hashtags ?? [],
          });
        }
      } catch (sttErr) {
        if (sttErr instanceof AppError && sttErr.code !== "NO_ACCESSIBLE_CAPTIONS") {
          throw sttErr;
        }
      }
    }

    // If still no items, report honest limitation
    if (rawItems.length === 0) {
      throw new AppError(
        "NO_ACCESSIBLE_CAPTIONS",
        "No accessible captions or transcript tracks were found for this video. The creator has not provided captions and automatic captions are disabled.",
        404,
        false,
      );
    }

    // 4. Normalize dialogue segments
    const originalSegments = normalizeSegments(rawItems);
    if (originalSegments.length === 0) {
      throw new AppError(
        "EMPTY_TRANSCRIPT",
        "The transcript for this video contains no spoken dialogue or accessible text.",
        404,
        false,
      );
    }

    const originalFullText = originalSegments.map((s) => s.text).join(" ");

    // 5. Multi-tier language detection and validation
    const detection = detectLanguageFromContent(
      originalFullText,
      selectedTrack,
      defaultAudioLanguage,
      rawItems[0]?.lang,
    );
    const sourceLanguage = detection.code;
    const sourceLanguageName = detection.name;
    const isLanguageUncertain = !detection.isConfident || detection.code === "und";
    detectionMethod = detection.method;

    const isAutomatic = selectedTrack ? selectedTrack.isAutomatic : true;
    const isHumanCreated = selectedTrack ? !selectedTrack.isAutomatic : false;

    const availableCaptionTracks: CaptionTrackInfo[] = availableTracks.map((t) => ({
      languageCode: t.languageCode,
      name: t.name,
      isAutomatic: t.isAutomatic,
      kind: t.kind,
      vssId: t.vssId,
    }));

    const availableLanguages =
      availableTracks.length > 0
        ? [...new Set(availableTracks.map((t) => normalizeLanguageCode(t.languageCode)))]
        : [sourceLanguage];

    return resolveOutputTranslation({
      videoId,
      metadata,
      originalSegments,
      originalFullText,
      sourceLanguage,
      sourceLanguageName,
      targetOutputLang,
      isAutomatic,
      isHumanCreated,
      availableLanguages,
      captionTrackLanguage: selectedTrack?.languageCode ?? null,
      languageDetectionMethod: detectionMethod,
      isLanguageUncertain,
      availableCaptionTracks,
      preferredTrackLang,
      tags: finalTags,
      hashtags: finalHashtags,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof YoutubeTranscriptDisabledError) {
      throw new AppError(
        "TRANSCRIPT_DISABLED",
        "Transcripts and captions are disabled for this video by the creator.",
        404,
        false,
      );
    }
    if (error instanceof YoutubeTranscriptNotAvailableLanguageError) {
      throw new AppError(
        "LANGUAGE_NOT_AVAILABLE",
        `Transcript is not available in the requested language${preferredTrackLang ? ` (${preferredTrackLang})` : ""}.`,
        404,
        false,
      );
    }
    if (error instanceof YoutubeTranscriptNotAvailableError) {
      throw new AppError(
        "NO_ACCESSIBLE_CAPTIONS",
        "No accessible captions or transcript tracks were found for this video. The creator has not provided captions and automatic captions are disabled.",
        404,
        false,
      );
    }
    if (error instanceof YoutubeTranscriptVideoUnavailableError) {
      throw new AppError(
        "VIDEO_UNAVAILABLE",
        "This video is private, removed, or unavailable.",
        404,
        false,
      );
    }
    if (error instanceof YoutubeTranscriptTooManyRequestError) {
      throw new AppError(
        "YOUTUBE_RATE_LIMIT",
        "YouTube request rate limit reached. Please wait a moment and try again.",
        429,
        true,
      );
    }
    throw new AppError(
      "TRANSCRIPT_FETCH_FAILED",
      error instanceof Error ? error.message : "Failed to retrieve transcript from YouTube.",
      502,
      true,
    );
  }
}

async function resolveOutputTranslation(params: {
  videoId: string;
  metadata: Awaited<ReturnType<typeof fetchVideoMetadata>>;
  originalSegments: ReturnType<typeof normalizeSegments>;
  originalFullText: string;
  sourceLanguage: string;
  sourceLanguageName: string;
  targetOutputLang: string;
  isAutomatic: boolean;
  isHumanCreated: boolean;
  availableLanguages: string[];
  captionTrackLanguage: string | null;
  languageDetectionMethod: string;
  isLanguageUncertain: boolean;
  availableCaptionTracks: CaptionTrackInfo[];
  preferredTrackLang?: string;
  tags?: string[];
  hashtags?: string[];
}): Promise<TranscriptPayload> {
  const {
    videoId,
    metadata,
    originalSegments,
    originalFullText,
    sourceLanguage,
    sourceLanguageName,
    targetOutputLang,
    isAutomatic,
    isHumanCreated,
    availableLanguages,
    captionTrackLanguage,
    languageDetectionMethod,
    isLanguageUncertain,
    availableCaptionTracks,
    preferredTrackLang,
    tags,
    hashtags,
  } = params;

  const resolvedTags = tags ?? metadata.tags ?? [];
  const resolvedHashtags = hashtags ?? metadata.hashtags ?? [];

  const cleanTarget = normalizeLanguageCode(targetOutputLang);
  const cleanSource = normalizeLanguageCode(sourceLanguage);

  const shouldTranslate =
    targetOutputLang !== "original" &&
    cleanTarget !== "" &&
    cleanTarget !== "und" &&
    cleanTarget !== cleanSource;

  let finalSegments = originalSegments;
  let finalFullText = originalFullText;
  let outputLanguage = sourceLanguage;
  let outputLanguageName = sourceLanguageName;
  let isTranslated = false;
  let translationStatus: "not_needed" | "completed" | "failed" = "not_needed";

  if (shouldTranslate) {
    try {
      const translation = await translateTranscript({
        segments: originalSegments,
        targetLanguage: targetOutputLang,
        sourceLanguage,
      });
      finalSegments = translation.segments;
      finalFullText = translation.fullText;
      outputLanguage = translation.targetLanguage;
      outputLanguageName = translation.targetLanguageName;
      isTranslated = true;
      translationStatus = "completed";
    } catch (err) {
      translationStatus = "failed";
      throw new AppError(
        "TRANSLATION_FAILED",
        err instanceof Error ? err.message : `Failed to translate transcript from ${sourceLanguageName} to ${getLanguageDisplayName(targetOutputLang)}.`,
        502,
        true,
      );
    }
  }

  const charCount = finalFullText.length;
  const wordCount = finalFullText.split(/\s+/u).filter(Boolean).length;

  return {
    videoId,
    videoMetadata: {
      ...metadata,
      tags: resolvedTags,
      hashtags: resolvedHashtags,
    },
    tags: resolvedTags,
    hashtags: resolvedHashtags,
    sourceLanguage,
    sourceLanguageName,
    outputLanguage,
    outputLanguageName,
    isTranslated,
    isAutomatic,
    isHumanCreated,
    availableLanguages,
    segments: finalSegments,
    originalSegments,
    fullText: finalFullText,
    charCount,
    wordCount,
    accuracyDisclosure: isAutomatic
      ? "Retrieved directly from YouTube automatic caption tracks. May contain recognition errors. Not 100% guaranteed."
      : "Retrieved directly from creator-provided YouTube captions.",
    languageMode:
      preferredTrackLang && preferredTrackLang !== "auto" && preferredTrackLang !== "original"
        ? "manual"
        : "auto",
    languageDetectionStatus: isLanguageUncertain ? "uncertain" : "detected",
    selectedTranscriptLanguage: targetOutputLang,
    actualTranscriptLanguage: outputLanguage,
    captionTrackLanguage,
    languageDetectionMethod,
    translationStatus,
    isLanguageUncertain,
    availableCaptionTracks,
  };
}

export function invalidateTranscriptCache(videoId?: string): void {
  transcriptDataCache.invalidate(videoId);
}
