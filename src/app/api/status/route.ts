import { successResponse } from "@/lib/api/response";
import { ManualGoogleTrendsProvider } from "@/lib/providers/google-trends";
import { UnconfiguredKeywordVolumeProvider } from "@/lib/providers/keyword-volume";
import { YouTubeSuggestionProvider } from "@/lib/providers/suggestions";
import { YouTubeDataProvider } from "@/lib/providers/youtube";

export function GET(): Response {
  const providers = [
    new YouTubeDataProvider().status,
    new YouTubeSuggestionProvider().status,
    new ManualGoogleTrendsProvider().status,
    new UnconfiguredKeywordVolumeProvider().status,
  ];
  return successResponse({
    providers,
    storage: {
      type: "Browser localStorage",
      durableOnServer: false,
      sharedAcrossUsers: false,
      storesSecrets: false,
    },
    cache: {
      type: "Bounded in-memory TTL cache",
      durable: false,
      maximumEntries: 250,
    },
  }, {
    source: "Server configuration",
    sampleSize: providers.length,
  });
}
