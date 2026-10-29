export type SourceType =
  | "youtube_video"
  | "youtube_search"
  | "youtube_suggestion"
  | "youtube_popular"
  | "google_trends"
  | "keyword_provider"
  | "local_calculation"
  | "generated_candidate";

export type TrendStatus = "rising" | "stable" | "falling" | "new_observation" | "unavailable";
export type VolumeType = "provider_estimate" | "relative_interest" | "not_available";

export interface SourceEvidence {
  id: string;
  sourceType: SourceType;
  sourceName: string;
  sourceUrl: string | null;
  observedAt: string;
  region: string | null;
  language: string | null;
  videoId: string | null;
  channelId: string | null;
  detail: string;
}

export interface MetricProvenance {
  metric: string;
  sourceType: SourceType;
  sourceName: string;
  observedAt: string;
  methodology: string;
  sampleSize: number | null;
  confidence: "high" | "medium" | "low" | "unavailable";
}

export interface VideoStatistics {
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
}

export interface VideoRecord {
  id: string;
  url: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string | null;
  tags: string[] | null;
  tagStatus: "found" | "empty" | "unavailable";
  hashtags: { title: string[]; description: string[] };
  statistics: VideoStatistics;
  durationSeconds: number | null;
  categoryId: string | null;
  observedAt: string;
  region: string | null;
}

export interface ExtractionError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ExtractionItem {
  input: string;
  normalizedId: string | null;
  kind: "video" | "channel" | "unknown";
  status: "complete" | "partial" | "failed";
  videos: VideoRecord[];
  error: ExtractionError | null;
}

export interface ExtractionProjectPayload {
  specification: { inputs: string[]; channelLimit: number; deduplicateTags: boolean };
  results: ExtractionItem[];
}

export interface KeywordMetric {
  keyword: string;
  sourceType: SourceType;
  sourceName: string;
  sourceUrl: string | null;
  observedAt: string;
  region: string | null;
  language: string | null;
  searchVolume: number | null;
  volumePeriod: string | null;
  volumeType: VolumeType;
  volumeConfidence: "high" | "medium" | "low" | "unavailable";
  trendIndex: number | null;
  trendChangePercent: number | null;
  trendStatus: TrendStatus;
  videoCount: number | null;
  channelCount: number | null;
  averageViews: number | null;
  medianViews: number | null;
  competitionScore: number | null;
  evidenceCount: number;
  evidence: SourceEvidence[];
  provenance: MetricProvenance[];
}

export interface TermAggregate {
  term: string;
  normalizedTerm: string;
  kind: "tag" | "hashtag" | "title_keyword" | "title_phrase";
  distinctVideoCount: number;
  distinctChannelCount: number;
  observationCount: number;
  currentPrevalence: number | null;
  baselineVideoCount: number | null;
  baselineSampleSize: number | null;
  baselinePrevalence: number | null;
  baselineObservedAt: string | null;
  averageViews: number | null;
  medianViews: number | null;
  firstPublishedAt: string;
  lastPublishedAt: string;
  firstObservedAt: string;
  lastObservedAt: string;
  region: string | null;
  sampleSize: number;
  sourceType: SourceType;
  sourceName: string;
  evidence: SourceEvidence[];
  trendStatus: TrendStatus;
  trendChangePercent: number | null;
  trendExplanation: string;
  viewGrowthPercent: number | null;
  viewGrowthVideoCount: number;
  viewGrowthExplanation: string;
}

export interface SuggestionObservation {
  keyword: string;
  query: string;
  position: number;
  observedAt: string;
  region: string;
  language: string;
  sourceName: string;
  sourceType: "youtube_suggestion";
  sourceUrl: null;
}

export interface ResearchRunSpecification {
  query: string;
  region: string;
  language: string;
  maxResults: number;
  includeSuggestions: boolean;
  includeGeneratedCandidates: boolean;
  publishedAfter: string | null;
}

export interface ResearchResult {
  specification: ResearchRunSpecification;
  query: string;
  region: string;
  language: string;
  retrievedAt: string;
  sampleSize: number;
  videos: VideoRecord[];
  suggestions: KeywordMetric[];
  titleKeywords: KeywordMetric[];
  tags: KeywordMetric[];
  hashtags: KeywordMetric[];
  relatedQueries: KeywordMetric[];
  providerMetrics: KeywordMetric[];
  generatedCandidates: KeywordMetric[];
  warnings: string[];
}

export interface TrendRunSpecification {
  query: string | null;
  region: string;
  language: string | null;
  timeframe: string;
  customStart: string | null;
  customEnd: string | null;
  categoryId: string | null;
  order: "date" | "viewCount" | "relevance";
  contentType: "all" | "short" | "long";
  maxResults: number;
  discoveryMethod: "youtube_search" | "youtube_popular";
}

export interface TrendResult {
  specification: TrendRunSpecification;
  query: string | null;
  region: string;
  language: string | null;
  timeframe: string;
  windowStart: string;
  windowEnd: string;
  retrievedAt: string;
  sampleSize: number;
  discoveryMethod: "youtube_search" | "youtube_popular";
  videos: VideoRecord[];
  tags: TermAggregate[];
  hashtags: TermAggregate[];
  titleKeywords: TermAggregate[];
  titlePhrases: TermAggregate[];
  warnings: string[];
}

export interface TagComparisonVideo {
  video: VideoRecord;
  normalizedTags: Record<string, string>;
  titleKeywords: string[];
  hashtags: string[];
}

export interface CompetitorComparison {
  specification: { inputs: string[]; referenceIndex: number; channelLimit: number };
  retrievedAt: string;
  referenceVideoId: string;
  sampleSize: number;
  videos: TagComparisonVideo[];
  commonTags: string[];
  tagsByVideo: Record<string, string[]>;
  missingFromReference: string[];
  commonTitleKeywords: string[];
  commonHashtags: string[];
  warnings: string[];
}

export interface ApiMeta {
  source: string;
  retrievedAt: string;
  cached: boolean | null;
  cacheAgeSeconds: number | null;
  sampleSize: number | null;
  region: string | null;
  language: string | null;
  warnings: string[];
}

export interface ApiFailure {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, string[]>;
}

export type ApiEnvelope<T> =
  | { ok: true; data: T; meta: ApiMeta; error: null }
  | { ok: false; data: null; meta: ApiMeta; error: ApiFailure };

export interface TrendSnapshot {
  id: string;
  fingerprint: string;
  capturedAt: string;
  result: TrendResult;
}

export interface SavedProject {
  id: string;
  name: string;
  type: "research" | "extraction" | "trend" | "competitor" | "hashtag";
  createdAt: string;
  updatedAt: string;
  notes: string;
  payload: unknown;
}

export interface ActivityEntry {
  id: string;
  operation: SavedProject["type"];
  label: string;
  createdAt: string;
  resultCount: number;
}

export interface ExportEntry {
  id: string;
  filename: string;
  format: "csv" | "json";
  createdAt: string;
  rowCount: number;
}

export interface WorkspacePreferences {
  theme: "system" | "light" | "dark";
  defaultRegion: string;
  defaultLanguage: string;
  deduplicateTags: boolean;
  suggestionsEnabled: boolean;
}

export interface WorkspaceState {
  version: 1;
  projects: SavedProject[];
  activities: ActivityEntry[];
  favoriteKeywords: string[];
  comparisonHistory: CompetitorComparison[];
  exportHistory: ExportEntry[];
  trendSnapshots: TrendSnapshot[];
  preferences: WorkspacePreferences;
}

export interface VideoMetadataDetails {
  id: string;
  url: string;
  title: string;
  channelTitle: string;
  channelUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  durationFormatted: string | null;
  publishedAt: string | null;
  viewCount: number | null;
  description: string | null;
  tags?: string[];
  hashtags?: string[];
}

export interface TranscriptSegmentItem {
  text: string;
  start: number;
  duration: number;
  timestamp: string;
}

export interface CaptionTrackInfo {
  languageCode: string;
  name: string;
  isAutomatic: boolean;
  kind?: string;
  vssId?: string;
}

export interface TranscriptPayload {
  videoId: string;
  videoMetadata: VideoMetadataDetails;
  sourceLanguage: string;
  sourceLanguageName: string;
  outputLanguage: string;
  outputLanguageName: string;
  isTranslated: boolean;
  isAutomatic: boolean;
  isHumanCreated: boolean;
  availableLanguages: string[];
  segments: TranscriptSegmentItem[];
  originalSegments: TranscriptSegmentItem[];
  fullText: string;
  charCount: number;
  wordCount: number;
  accuracyDisclosure: string;

  // Dedicated language tracking fields
  languageMode?: "auto" | "manual";
  languageDetectionStatus?: "pending" | "detected" | "multilingual" | "uncertain";
  selectedTranscriptLanguage: string;
  actualTranscriptLanguage: string;
  captionTrackLanguage: string | null;
  languageDetectionMethod: string;
  translationStatus: "not_needed" | "completed" | "failed";
  isLanguageUncertain: boolean;
  availableCaptionTracks: CaptionTrackInfo[];

  // Keywords (tags) and hashtags
  tags?: string[];
  hashtags?: string[];
}

export interface SummarySectionItem {
  title: string;
  points: string[];
}

export interface SummaryPayload {
  videoId: string;
  overview: string;
  keyTakeaways: string[];
  sections: SummarySectionItem[];
  language: string;
  modelUsed: string;
  summaryType: "concise" | "detailed";
  generatedAt: string;
}

export interface TranslationPayload {
  targetLanguage: string;
  targetLanguageName: string;
  sourceLanguage: string;
  segments: TranscriptSegmentItem[];
  fullText: string;
  service: string;
}

