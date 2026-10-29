import { z } from "zod";
import { externalDataCache } from "@/lib/api/cache";
import { AppError } from "@/lib/api/errors";
import { fetchValidatedJson } from "@/lib/api/http";
import type { ProviderResult, ProviderStatus, SuggestionProvider } from "@/lib/providers/types";
import type { SuggestionObservation } from "@/types/research";

const suggestionPayloadSchema = z.array(z.unknown()).min(2);
const ALLOWED_SUGGESTION_ENDPOINTS = new Set([
  "https://suggestqueries-clients6.youtube.com/complete/search",
  "https://suggestqueries.google.com/complete/search",
]);

export class YouTubeSuggestionProvider implements SuggestionProvider {
  readonly status: ProviderStatus;
  private readonly endpoint: string;

  constructor() {
    this.endpoint = process.env.YOUTUBE_SUGGESTIONS_BASE_URL ?? "https://suggestqueries-clients6.youtube.com/complete/search";
    const enabled = process.env.YOUTUBE_SUGGESTIONS_ENABLED === "true";
    const endpointAllowed = ALLOWED_SUGGESTION_ENDPOINTS.has(this.endpoint);
    this.status = {
      id: "youtube-suggestions",
      name: "YouTube autocomplete",
      configured: enabled && endpointAllowed,
      live: enabled && endpointAllowed,
      supplies: ["Autocomplete suggestions shown for the submitted query in the selected region and language"],
      limitation: "Suggestions are a point-in-time observation. An appearance is not a search, and its position does not measure search demand.",
    };
  }

  async getSuggestions(query: string, region: string, language: string): Promise<ProviderResult<SuggestionObservation[]>> {
    if (!this.status.configured) {
      throw new AppError(
        "SUGGESTIONS_NOT_CONFIGURED",
        "YouTube autocomplete is not enabled here. Continue with the video results, or enable suggestions and try again.",
        503,
        false,
      );
    }
    const url = new URL(this.endpoint);
    url.search = new URLSearchParams({ client: "youtube", ds: "yt", q: query, gl: region, hl: language }).toString();
    const key = `suggestions:${url.toString()}`;
    const lookup = await externalDataCache.getOrSet(key, 10 * 60_000, () => fetchValidatedJson(url, suggestionPayloadSchema));
    const retrievedAt = new Date(lookup.storedAt).toISOString();
    const suggestions = extractSuggestionStrings(lookup.value[1]).map((keyword, position) => ({
      keyword,
      query,
      position: position + 1,
      observedAt: retrievedAt,
      region,
      language,
      sourceName: "YouTube autocomplete",
      sourceType: "youtube_suggestion" as const,
      sourceUrl: null,
    }));
    return {
      data: suggestions,
      retrievedAt,
      cached: lookup.cached,
      cacheAgeSeconds: lookup.cached ? Math.max(0, Math.floor((Date.now() - lookup.storedAt) / 1000)) : null,
      warnings: ["The suggestion order is what autocomplete showed at that moment. It is not a search count or measure of demand."],
    };
  }
}

function extractSuggestionStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = typeof item === "string" ? item : Array.isArray(item) && typeof item[0] === "string" ? item[0] : null;
    if (!text) continue;
    const normalized = text.normalize("NFKC").toLocaleLowerCase().trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(text.trim());
    }
  }
  return result.slice(0, 20);
}
