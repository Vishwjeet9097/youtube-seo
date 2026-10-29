import { AppError } from "@/lib/api/errors";
import { estimateYouTubeInputCost } from "@/lib/api/rate-limit";
import { enforceRateLimit, enforceSameOrigin, errorResponse, readJson, successResponse } from "@/lib/api/response";
import { YouTubeDataProvider } from "@/lib/providers/youtube";
import { extractRequestSchema } from "@/lib/schemas";
import { extractYouTubeInputs } from "@/lib/services/extraction";

export async function POST(request: Request): Promise<Response> {
  try {
    enforceSameOrigin(request); enforceRateLimit(request);
    const input = await readJson(request, extractRequestSchema);
    const estimate = estimateYouTubeInputCost(input.inputs);
    if (estimate.channelCount > 5) throw new AppError("CHANNEL_BATCH_LIMIT", "Use no more than five channels. You can include up to 20 videos.", 400, false);
    if (estimate.cost > 1) enforceRateLimit(request, estimate.cost - 1);
    const provider = new YouTubeDataProvider();
    const data = await extractYouTubeInputs(provider, input.inputs, input.channelLimit);
    const videos = data.flatMap((item) => item.videos);
    const warnings = data.filter((item) => item.error).map((item) => `${item.input}: ${item.error!.message}`);
    return successResponse(data, { source: provider.status.name, retrievedAt: videos.map((video) => video.observedAt).sort().at(-1), sampleSize: videos.length, warnings });
  } catch (error) { return errorResponse(error, { source: "YouTube Data API v3" }); }
}
