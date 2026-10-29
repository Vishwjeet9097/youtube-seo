import { enforceRateLimit, enforceSameOrigin, errorResponse, readJson, successResponse } from "@/lib/api/response";
import { youtubeSummaryRequestSchema } from "@/lib/schemas";
import { generateTranscriptSummary } from "@/lib/services/ai-summary";

export async function POST(request: Request): Promise<Response> {
  try {
    enforceSameOrigin(request);
    // AI summarization has higher compute cost, enforce slightly higher rate limit weighting
    enforceRateLimit(request, 2);
    const body = await readJson(request, youtubeSummaryRequestSchema);
    const summary = await generateTranscriptSummary({
      videoId: body.videoId,
      transcript: body.transcript,
      summaryType: body.summaryType,
      language: body.language,
    });

    return successResponse(summary, {
      source: `AI Engine: ${summary.modelUsed}`,
      language: summary.language,
      retrievedAt: summary.generatedAt,
    });
  } catch (error) {
    return errorResponse(error, { source: "AI Summary Engine" });
  }
}
