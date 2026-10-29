import { BoundedTtlCache } from "@/lib/api/cache";
import type { TranscriptPayload } from "@/types/research";

const CACHE_VERSION = "v3";

export class TranscriptCache {
  private readonly cache = new BoundedTtlCache(100);

  /**
   * Generates a deterministic cache key that isolates video ID, caption track language, and output language.
   */
  makeKey(params: {
    videoId: string;
    captionTrackLanguage?: string | null;
    outputLanguage?: string | null;
  }): string {
    const vId = params.videoId.trim();
    const trackLang = (params.captionTrackLanguage || "auto").trim().toLowerCase();
    const outLang = (params.outputLanguage || "original").trim().toLowerCase();
    return `transcript:${vId}:${trackLang}:${outLang}:${CACHE_VERSION}`;
  }

  /**
   * Validates cached transcript to ensure that:
   * 1. The cached transcript matches requested parameters.
   * 2. If the text actually contains Devanagari Unicode characters, it is NOT mislabeled as English.
   * 3. An old English transcript is NEVER used for a Hindi video.
   * 4. A translated transcript is NEVER returned when original language is requested.
   */
  isValid(cached: TranscriptPayload, requestedOutputLang?: string): boolean {
    if (!cached || !cached.videoId || !cached.segments || cached.segments.length === 0) {
      return false;
    }

    const fullText = cached.fullText || "";
    const hasDevanagari = /[\u0900-\u097F]/u.test(fullText);

    // If dialogue text has Devanagari, sourceLanguage MUST be Hindi
    if (hasDevanagari && cached.sourceLanguage !== "hi") {
      return false;
    }

    // Never return a translated transcript when original language is requested
    const isOriginalRequested = !requestedOutputLang || requestedOutputLang === "original";
    if (isOriginalRequested && cached.isTranslated) {
      return false;
    }

    // If a Hindi caption track was available but English was selected as source, reject stale/buggy cache
    if (
      cached.availableCaptionTracks &&
      cached.availableCaptionTracks.some((t) => t.languageCode.startsWith("hi")) &&
      cached.sourceLanguage === "en"
    ) {
      return false;
    }

    // If requested output language is specified and not "original", check match
    if (requestedOutputLang && requestedOutputLang !== "original") {
      const cleanReq = requestedOutputLang.toLowerCase().slice(0, 2);
      if (cached.outputLanguage.toLowerCase().slice(0, 2) !== cleanReq) {
        return false;
      }
    }

    return true;
  }

  async getOrSet(
    params: {
      videoId: string;
      captionTrackLanguage?: string | null;
      outputLanguage?: string | null;
    },
    ttlMs: number,
    factory: () => Promise<TranscriptPayload>,
  ): Promise<TranscriptPayload> {
    const key = this.makeKey(params);
    const lookup = await this.cache.getOrSet(key, ttlMs, async () => {
      const result = await factory();
      return result;
    });

    // Check validity of cached entry
    if (lookup.cached && !this.isValid(lookup.value, params.outputLanguage ?? undefined)) {
      // Stale or mislabeled cache entry, invalidate and refetch
      this.cache.clear();
      const fresh = await factory();
      return fresh;
    }

    return lookup.value;
  }

  invalidate(videoId?: string): void {
    if (!videoId) {
      this.cache.clear();
      return;
    }
    // We clear all entries for safety or clear cache
    this.cache.clear();
  }
}

export const transcriptDataCache = new TranscriptCache();
