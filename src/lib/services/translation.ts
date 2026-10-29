import { AppError } from "@/lib/api/errors";
import { LANGUAGE_NAMES } from "@/lib/services/transcript";
import type { TranscriptSegmentItem, TranslationPayload } from "@/types/research";

const BATCH_SIZE = 25;
const DELIMITER = "\n<<<SEG>>>\n";

export async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage = "auto",
): Promise<string> {
  const clean = text.trim();
  if (!clean) return "";

  const cleanTarget = targetLanguage.toLowerCase().slice(0, 5);
  const cleanSource = sourceLanguage === "original" ? "auto" : sourceLanguage.toLowerCase().slice(0, 5);

  if (cleanTarget === cleanSource && cleanSource !== "auto") {
    return text;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const params = new URLSearchParams({
      client: "gtx",
      sl: cleanSource,
      tl: cleanTarget,
      dt: "t",
      q: clean,
    });

    const response = await fetch("https://translate.googleapis.com/translate_a/single", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=utf-8",
        "user-agent": "SourceLens/1.0",
      },
      body: params.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AppError(
        "TRANSLATION_FAILED",
        `Translation service temporarily unavailable (status ${response.status}). Please try again.`,
        502,
        true,
      );
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new AppError(
        "INVALID_TRANSLATION_RESPONSE",
        "Unexpected translation response format.",
        502,
        false,
      );
    }

    return (data[0] as Array<[string]>).map((item) => item[0]).join("");
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("TRANSLATION_TIMEOUT", "Translation request timed out. Please try again.", 504, true);
    }
    throw new AppError(
      "TRANSLATION_FAILED",
      error instanceof Error ? error.message : "Could not complete translation. Try again.",
      502,
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function translateTranscript(params: {
  text?: string;
  segments?: TranscriptSegmentItem[];
  targetLanguage: string;
  sourceLanguage?: string;
}): Promise<TranslationPayload> {
  const { text, segments, targetLanguage, sourceLanguage = "auto" } = params;
  const targetCode = targetLanguage.toLowerCase().slice(0, 2);
  const targetName = LANGUAGE_NAMES[targetCode] ?? targetLanguage;

  if (segments && segments.length > 0) {
    const translatedSegments: TranscriptSegmentItem[] = [];

    // Process in batches
    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
      const slice = segments.slice(i, i + BATCH_SIZE);
      const joined = slice.map((s) => s.text).join(DELIMITER);

      try {
        const translatedBatch = await translateText(joined, targetLanguage, sourceLanguage);
        const parts = translatedBatch.split(/\s*<<<SEG>>>\s*/u);

        if (parts.length === slice.length) {
          for (let j = 0; j < slice.length; j += 1) {
            const seg = slice[j]!;
            translatedSegments.push({
              text: parts[j]?.trim() || seg.text,
              start: seg.start,
              duration: seg.duration,
              timestamp: seg.timestamp,
            });
          }
        } else {
          // Fallback: translate individually if delimiter alignment was disturbed
          for (const seg of slice) {
            const single = await translateText(seg.text, targetLanguage, sourceLanguage);
            translatedSegments.push({
              text: single || seg.text,
              start: seg.start,
              duration: seg.duration,
              timestamp: seg.timestamp,
            });
          }
        }
      } catch (err) {
        // Propagate failure honestly rather than silently falling back
        throw err;
      }
    }

    const fullText = translatedSegments.map((s) => s.text).join(" ");
    return {
      targetLanguage,
      targetLanguageName: targetName,
      sourceLanguage,
      segments: translatedSegments,
      fullText,
      service: "Google Neural Machine Translation",
    };
  }

  if (text) {
    const fullText = await translateText(text, targetLanguage, sourceLanguage);
    return {
      targetLanguage,
      targetLanguageName: targetName,
      sourceLanguage,
      segments: [],
      fullText,
      service: "Google Neural Machine Translation",
    };
  }

  throw new AppError("INVALID_TRANSLATION_INPUT", "No text or segments provided to translate.", 400, false);
}
