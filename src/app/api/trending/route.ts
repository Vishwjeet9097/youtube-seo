import { enforceRateLimit, enforceSameOrigin, errorResponse, readJson, successResponse } from "@/lib/api/response";
import { YouTubeDataProvider } from "@/lib/providers/youtube";
import { trendingRequestSchema } from "@/lib/schemas";
import { discoverTrends } from "@/lib/services/trending";

export async function POST(request: Request): Promise<Response> {
  try {
    enforceSameOrigin(request); enforceRateLimit(request);
    const input = await readJson(request, trendingRequestSchema);
    if (input.query) enforceRateLimit(request);
    const provider = new YouTubeDataProvider();
    const data = await discoverTrends(provider, input);
    return successResponse(data, { source: provider.status.name, retrievedAt: data.retrievedAt, sampleSize: data.sampleSize, region: data.region, language: data.language, warnings: data.warnings });
  } catch (error) { return errorResponse(error, { source: "YouTube trend discovery" }); }
}
