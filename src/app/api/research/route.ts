import { enforceRateLimit, enforceSameOrigin, errorResponse, readJson, successResponse } from "@/lib/api/response";
import { YouTubeSuggestionProvider } from "@/lib/providers/suggestions";
import { YouTubeDataProvider } from "@/lib/providers/youtube";
import { researchRequestSchema } from "@/lib/schemas";
import { researchTopic } from "@/lib/services/research";

export async function POST(request: Request): Promise<Response> {
  try {
    enforceSameOrigin(request); enforceRateLimit(request);
    const input = await readJson(request, researchRequestSchema);
    enforceRateLimit(request, input.includeSuggestions ? 2 : 1);
    const youtube = new YouTubeDataProvider();
    const suggestions = new YouTubeSuggestionProvider();
    const data = await researchTopic(youtube, suggestions, input);
    return successResponse(data, { source: "YouTube Data API v3 + configured observation adapters", retrievedAt: data.retrievedAt, sampleSize: data.sampleSize, region: data.region, language: data.language, warnings: data.warnings });
  } catch (error) { return errorResponse(error, { source: "Topic research providers" }); }
}
