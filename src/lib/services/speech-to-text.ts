import { AppError } from "@/lib/api/errors";
import type { TranscriptSegmentItem } from "@/types/research";
import { formatTimestamp } from "@/lib/services/transcript-formatting";

export interface SpeechToTextResult {
  text: string;
  detectedLanguage: string;
  detectedLanguageName: string;
  segments: TranscriptSegmentItem[];
  modelUsed: string;
}

export interface SpeechToTextProvider {
  isConfigured(): boolean;
  transcribeAudio(params: {
    videoId: string;
    audioUrl?: string;
    preferredLanguage?: string;
  }): Promise<SpeechToTextResult>;
}

// Global hook for injecting or registering SpeechToText providers (e.g. for Whisper or tests)
let activeSttProvider: SpeechToTextProvider | null = null;

export function registerSpeechToTextProvider(provider: SpeechToTextProvider | null): void {
  activeSttProvider = provider;
}

export function isSpeechToTextConfigured(): boolean {
  if (activeSttProvider?.isConfigured()) return true;
  // Check if OPENAI_API_KEY or GROQ_API_KEY is available with whisper support
  return Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim());
}

/**
 * Attempts transcription using supported speech-to-text providers.
 * Crucially, enables AUTOMATIC LANGUAGE DETECTION (never forces language: "en").
 */
export async function transcribeWithSpeechToText(params: {
  videoId: string;
  audioUrl?: string;
  preferredLanguage?: string;
}): Promise<SpeechToTextResult> {
  if (activeSttProvider && activeSttProvider.isConfigured()) {
    return activeSttProvider.transcribeAudio(params);
  }

  // If a provider is not configured or direct YouTube audio stream is not accessible
  throw new AppError(
    "NO_ACCESSIBLE_CAPTIONS",
    "No accessible captions or transcript tracks were found for this video. The creator has not provided captions, automatic captions are disabled, and automated speech-to-text audio fallback is unavailable.",
    404,
    false,
  );
}

export function createMockSttResult(
  text: string,
  detectedLanguage = "hi",
  detectedLanguageName = "Hindi (हिंदी)",
): SpeechToTextResult {
  const words = text.split(/\s+/u);
  const segments: TranscriptSegmentItem[] = [];
  let currentWordIdx = 0;
  const wordsPerSegment = 8;

  while (currentWordIdx < words.length) {
    const chunk = words.slice(currentWordIdx, currentWordIdx + wordsPerSegment).join(" ");
    const startSec = (currentWordIdx / wordsPerSegment) * 3;
    const durSec = 3;
    segments.push({
      text: chunk,
      start: Number(startSec.toFixed(2)),
      duration: durSec,
      timestamp: formatTimestamp(startSec),
    });
    currentWordIdx += wordsPerSegment;
  }

  return {
    text,
    detectedLanguage,
    detectedLanguageName,
    segments,
    modelUsed: "whisper-large-v3",
  };
}
