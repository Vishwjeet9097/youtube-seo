import { enforceRateLimit, enforceSameOrigin, errorResponse, readJson, successResponse } from "@/lib/api/response";
import { youtubeTranscriptRequestSchema } from "@/lib/schemas";
import { fetchVideoTranscript } from "@/lib/services/transcript";

export async function POST(request: Request): Promise<Response> {
  try {
    enforceSameOrigin(request);
    enforceRateLimit(request);
    const body = await readJson(request, youtubeTranscriptRequestSchema);
    const transcript = await fetchVideoTranscript(body.input, {
      lang: body.lang,
      trackLanguage: body.trackLanguage,
      outputLanguage: body.outputLanguage,
    });

    const warnings: string[] = [];
    if (transcript.isLanguageUncertain) {
      warnings.push("Language could not be determined with high confidence from caption metadata or text.");
    }

    return successResponse(transcript, {
      source: transcript.isTranslated
        ? "YouTube Captions + Translation Engine"
        : transcript.languageDetectionMethod === "speech_to_text"
          ? "Speech-to-Text Engine"
          : "YouTube Caption Tracks",
      language: transcript.outputLanguage,
      retrievedAt: new Date().toISOString(),
      sampleSize: transcript.segments.length,
      warnings,
    });
  } catch (error) {
    return errorResponse(error, { source: "YouTube Caption Tracks" });
  }
}
