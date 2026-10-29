import { enforceRateLimit, enforceSameOrigin, errorResponse, readJson, successResponse } from "@/lib/api/response";
import { youtubeTranslateRequestSchema } from "@/lib/schemas";
import { translateTranscript } from "@/lib/services/translation";

export async function POST(request: Request): Promise<Response> {
  try {
    enforceSameOrigin(request);
    enforceRateLimit(request);
    const body = await readJson(request, youtubeTranslateRequestSchema);
    const result = await translateTranscript({
      text: body.text,
      segments: body.segments,
      targetLanguage: body.targetLanguage,
      sourceLanguage: body.sourceLanguage,
    });

    return successResponse(result, {
      source: result.service,
      language: result.targetLanguage,
      retrievedAt: new Date().toISOString(),
      sampleSize: result.segments.length,
    });
  } catch (error) {
    return errorResponse(error, { source: "Translation Engine" });
  }
}
