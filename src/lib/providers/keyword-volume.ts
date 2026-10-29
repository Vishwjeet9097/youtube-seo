import type { KeywordVolumeProvider, ProviderStatus } from "@/lib/providers/types";

export class UnconfiguredKeywordVolumeProvider implements KeywordVolumeProvider {
  readonly status: ProviderStatus = {
    id: "keyword-volume",
    name: "Keyword volume provider",
    configured: false,
    live: false,
    supplies: ["Estimated search volume from a dedicated keyword data source", "Competition estimates from the same source"],
    limitation: "Connect a keyword data source to add search-volume and competition estimates. Until then, blank values mean unavailable, not zero; sample appearances and video views do not measure search demand.",
  };
}
