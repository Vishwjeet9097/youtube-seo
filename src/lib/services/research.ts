import type { ResearchRequest } from "@/lib/schemas";
import type { SuggestionProvider, VideoDataProvider } from "@/lib/providers/types";
import { aggregateVideoTerms } from "@/lib/metrics";
import { generatePotentialVariations } from "@/lib/text";
import type {
  KeywordMetric,
  MetricProvenance,
  ResearchResult,
  SourceEvidence,
  SuggestionObservation,
  TermAggregate,
} from "@/types/research";

export async function researchTopic(
  youtube: VideoDataProvider,
  suggestions: SuggestionProvider,
  request: ResearchRequest,
): Promise<ResearchResult> {
  const warnings: string[] = [];
  const videoResult = await youtube.searchVideos({
    query: request.query,
    region: request.region,
    language: request.language,
    publishedAfter: request.publishedAfter,
    maxResults: request.maxResults,
    order: "relevance",
  });
  warnings.push(...videoResult.warnings);

  let suggestionRows: SuggestionObservation[] = [];
  if (request.includeSuggestions) {
    try {
      const suggestionResult = await suggestions.getSuggestions(request.query, request.region, request.language);
      suggestionRows = suggestionResult.data;
      warnings.push(...suggestionResult.warnings);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Autocomplete suggestions couldn't be loaded. Continue with the video results or try again.");
    }
  }

  const tagAggregates = aggregateVideoTerms(videoResult.data, "tag", "youtube_search", request.region);
  const hashtagAggregates = aggregateVideoTerms(videoResult.data, "hashtag", "youtube_search", request.region);
  const titleAggregates = aggregateVideoTerms(videoResult.data, "title_keyword", "youtube_search", request.region);

  return {
    specification: {
      query: request.query,
      region: request.region,
      language: request.language,
      maxResults: request.maxResults,
      includeSuggestions: request.includeSuggestions,
      includeGeneratedCandidates: request.includeGeneratedCandidates,
      publishedAfter: request.publishedAfter ?? null,
    },
    query: request.query,
    region: request.region,
    language: request.language,
    retrievedAt: videoResult.retrievedAt,
    sampleSize: videoResult.data.length,
    videos: videoResult.data,
    suggestions: suggestionRows.map(suggestionToMetric),
    titleKeywords: titleAggregates.map(aggregateToMetric),
    tags: tagAggregates.map(aggregateToMetric),
    hashtags: hashtagAggregates.map(aggregateToMetric),
    relatedQueries: [],
    providerMetrics: [],
    generatedCandidates: request.includeGeneratedCandidates
      ? generatePotentialVariations(request.query).map((keyword) => generatedMetric(keyword, videoResult.retrievedAt, request.region, request.language))
      : [],
    warnings: [
      ...new Set([
        ...warnings,
        "Counts show how many videos in this sample contain each term; they are not search counts. Public tags come from uploaders, and title words are kept separate.",
        "Without a keyword data source, search volume and competition remain unavailable. Blank values mean unavailable, not zero; video views do not measure search demand.",
      ]),
    ],
  };
}

function aggregateToMetric(aggregate: TermAggregate): KeywordMetric {
  const methodology = `This ${aggregate.kind.replaceAll("_", " ")} appeared in ${aggregate.distinctVideoCount} of the ${aggregate.sampleSize} videos in the YouTube result sample; each distinct video is counted once. Sample appearances are not searches.`;
  return {
    keyword: aggregate.term,
    sourceType: aggregate.sourceType,
    sourceName: aggregate.sourceName,
    sourceUrl: null,
    observedAt: aggregate.lastObservedAt,
    region: aggregate.region,
    language: null,
    searchVolume: null,
    volumePeriod: null,
    volumeType: "not_available",
    volumeConfidence: "unavailable",
    trendIndex: null,
    trendChangePercent: null,
    trendStatus: "new_observation",
    videoCount: aggregate.distinctVideoCount,
    channelCount: aggregate.distinctChannelCount,
    averageViews: aggregate.averageViews,
    medianViews: aggregate.medianViews,
    competitionScore: null,
    evidenceCount: aggregate.distinctVideoCount,
    evidence: aggregate.evidence,
    provenance: [provenance(aggregate.kind, aggregate.sourceType, aggregate.sourceName, aggregate.lastObservedAt, methodology, aggregate.sampleSize)],
  };
}

function suggestionToMetric(suggestion: SuggestionObservation): KeywordMetric {
  const evidence: SourceEvidence = {
    id: `suggestion:${suggestion.query}:${suggestion.position}`,
    sourceType: "youtube_suggestion",
    sourceName: suggestion.sourceName,
    sourceUrl: null,
    observedAt: suggestion.observedAt,
    region: suggestion.region,
    language: suggestion.language,
    videoId: null,
    channelId: null,
    detail: `YouTube autocomplete showed this suggestion at position ${suggestion.position} for the query “${suggestion.query}”.`,
  };
  return {
    keyword: suggestion.keyword,
    sourceType: "youtube_suggestion",
    sourceName: suggestion.sourceName,
    sourceUrl: null,
    observedAt: suggestion.observedAt,
    region: suggestion.region,
    language: suggestion.language,
    searchVolume: null,
    volumePeriod: null,
    volumeType: "not_available",
    volumeConfidence: "unavailable",
    trendIndex: null,
    trendChangePercent: null,
    trendStatus: "new_observation",
    videoCount: null,
    channelCount: null,
    averageViews: null,
    medianViews: null,
    competitionScore: null,
    evidenceCount: 1,
    evidence: [evidence],
    provenance: [provenance("suggestion observation", "youtube_suggestion", suggestion.sourceName, suggestion.observedAt, "Autocomplete returned this suggestion for the exact query in the selected region and language. Its position is display order, not a search count or measure of demand.", 1)],
  };
}

function generatedMetric(keyword: string, observedAt: string, region: string, language: string): KeywordMetric {
  return {
    keyword,
    sourceType: "generated_candidate",
    sourceName: "Generated from your query",
    sourceUrl: null,
    observedAt,
    region,
    language,
    searchVolume: null,
    volumePeriod: null,
    volumeType: "not_available",
    volumeConfidence: "unavailable",
    trendIndex: null,
    trendChangePercent: null,
    trendStatus: "unavailable",
    videoCount: null,
    channelCount: null,
    averageViews: null,
    medianViews: null,
    competitionScore: null,
    evidenceCount: 0,
    evidence: [],
    provenance: [provenance("candidate", "generated_candidate", "Generated from your query", observedAt, "Created from your query as an idea. It has not been verified against YouTube results; check source evidence before using it.", null)],
  };
}

function provenance(
  metric: string,
  sourceType: MetricProvenance["sourceType"],
  sourceName: string,
  observedAt: string,
  methodology: string,
  sampleSize: number | null,
): MetricProvenance {
  return { metric, sourceType, sourceName, observedAt, methodology, sampleSize, confidence: sourceType === "generated_candidate" ? "low" : "high" };
}
