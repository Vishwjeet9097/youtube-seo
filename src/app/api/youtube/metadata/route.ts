import { enforceRateLimit, enforceSameOrigin, errorResponse, readJson, successResponse } from "@/lib/api/response";
import { youtubeMetadataRequestSchema } from "@/lib/schemas";
import { fetchVideoMetadata } from "@/lib/services/metadata";

export async function POST(request: Request): Promise<Response> {
  try {
    enforceSameOrigin(request);
    enforceRateLimit(request);
    const body = await readJson(request, youtubeMetadataRequestSchema);
    const metadata = await fetchVideoMetadata(body.input);

    return successResponse(metadata, {
      source: "YouTube Metadata Provider",
      retrievedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error, { source: "YouTube Metadata Provider" });
  }
}
