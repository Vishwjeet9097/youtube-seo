import { AppError } from "@/lib/api/errors";
import { estimateYouTubeInputCost } from "@/lib/api/rate-limit";
import { enforceRateLimit, enforceSameOrigin, errorResponse, readJson, successResponse } from "@/lib/api/response";
import { YouTubeDataProvider } from "@/lib/providers/youtube";
import { competitorRequestSchema } from "@/lib/schemas";
import { compareCompetitors } from "@/lib/services/competitors";

export async function POST(request: Request): Promise<Response> {
  try {
    enforceSameOrigin(request); enforceRateLimit(request);
    const input = await readJson(request, competitorRequestSchema);
    if (input.referenceIndex >= input.inputs.length) throw new AppError("INVALID_REFERENCE", "Choose a reference entry from your submitted list.", 400, false);
    const estimate = estimateYouTubeInputCost(input.inputs);
    if (estimate.channelCount > 5) throw new AppError("CHANNEL_BATCH_LIMIT", "Use no more than five channels for a comparison.", 400, false);
    if (estimate.cost > 1) enforceRateLimit(request, estimate.cost - 1);
    const provider = new YouTubeDataProvider();
    const data = await compareCompetitors(provider, input.inputs, input.referenceIndex, input.channelLimit);
    return successResponse(data, { source: provider.status.name, retrievedAt: data.retrievedAt, sampleSize: data.sampleSize, warnings: data.warnings });
  } catch (error) { return errorResponse(error, { source: "Competitor analysis" }); }
}
