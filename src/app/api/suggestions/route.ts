import { enforceRateLimit, enforceSameOrigin, errorResponse, readJson, successResponse } from "@/lib/api/response";
import { YouTubeSuggestionProvider } from "@/lib/providers/suggestions";
import { suggestionRequestSchema } from "@/lib/schemas";

export async function POST(request: Request): Promise<Response> {
  try {
    enforceSameOrigin(request); enforceRateLimit(request);
    const input = await readJson(request, suggestionRequestSchema);
    const provider = new YouTubeSuggestionProvider();
    const result = await provider.getSuggestions(input.query, input.region, input.language);
    return successResponse(result.data, { source: provider.status.name, retrievedAt: result.retrievedAt, cached: result.cached, cacheAgeSeconds: result.cacheAgeSeconds, sampleSize: result.data.length, region: input.region, language: input.language, warnings: result.warnings });
  } catch (error) { return errorResponse(error, { source: "YouTube autocomplete" }); }
}
