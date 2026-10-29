import { z } from "zod";
import { normalizeForMatch } from "@/lib/text";
import type {
  ActivityEntry,
  ExportEntry,
  SavedProject,
  TrendResult,
  TrendSnapshot,
  WorkspacePreferences,
  WorkspaceState,
} from "@/types/research";

export const WORKSPACE_STORAGE_KEY = "youtube-evidence-lab:workspace";
export const WORKSPACE_VERSION = 1 as const;
const MAX_PROJECTS = 100;
const MAX_ACTIVITIES = 100;
const MAX_SNAPSHOTS = 60;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_WORKSPACE_BYTES = 4 * 1024 * 1024;

const timestampSchema = z.iso.datetime({ offset: true });
const nullableCountSchema = z.number().finite().nonnegative().nullable();
const sourceTypeSchema = z.enum(["youtube_video", "youtube_search", "youtube_suggestion", "youtube_popular", "google_trends", "keyword_provider", "local_calculation", "generated_candidate"]);
const trendStatusSchema = z.enum(["rising", "stable", "falling", "new_observation", "unavailable"]);
const confidenceSchema = z.enum(["high", "medium", "low", "unavailable"]);

const evidenceSchema = z.object({
  id: z.string().min(1).max(500), sourceType: sourceTypeSchema, sourceName: z.string().min(1).max(200),
  sourceUrl: z.url().nullable(), observedAt: timestampSchema, region: z.string().max(20).nullable(), language: z.string().max(20).nullable(),
  videoId: z.string().max(100).nullable(), channelId: z.string().max(100).nullable(), detail: z.string().max(2_000),
});
const provenanceSchema = z.object({
  metric: z.string().min(1).max(200), sourceType: sourceTypeSchema, sourceName: z.string().min(1).max(200), observedAt: timestampSchema,
  methodology: z.string().min(1).max(4_000), sampleSize: z.number().int().nonnegative().nullable(), confidence: confidenceSchema,
});
const videoSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{11}$/u), url: z.url(), title: z.string().max(5_000), description: z.string().max(250_000),
  channelId: z.string().max(100), channelTitle: z.string().max(1_000), publishedAt: timestampSchema, thumbnailUrl: z.url().nullable(),
  tags: z.array(z.string().max(1_000)).max(500).nullable(), tagStatus: z.enum(["found", "empty", "unavailable"]),
  hashtags: z.object({ title: z.array(z.string().max(200)).max(500), description: z.array(z.string().max(200)).max(1_000) }),
  statistics: z.object({ viewCount: nullableCountSchema, likeCount: nullableCountSchema, commentCount: nullableCountSchema }),
  durationSeconds: nullableCountSchema, categoryId: z.string().max(50).nullable(), observedAt: timestampSchema, region: z.string().max(20).nullable(),
});
const extractionErrorSchema = z.object({ code: z.string().max(100), message: z.string().max(2_000), retryable: z.boolean() });
const extractionItemSchema = z.object({
  input: z.string().max(500), normalizedId: z.string().max(200).nullable(), kind: z.enum(["video", "channel", "unknown"]),
  status: z.enum(["complete", "partial", "failed"]), videos: z.array(videoSchema).max(50), error: extractionErrorSchema.nullable(),
});
const extractionPayloadSchema = z.object({
  specification: z.object({ inputs: z.array(z.string().max(500)).min(1).max(20), channelLimit: z.number().int().min(1).max(50), deduplicateTags: z.boolean() }),
  results: z.array(extractionItemSchema).min(1).max(20),
});
const keywordMetricSchema = z.object({
  keyword: z.string().min(1).max(500), sourceType: sourceTypeSchema, sourceName: z.string().min(1).max(200), sourceUrl: z.url().nullable(),
  observedAt: timestampSchema, region: z.string().max(20).nullable(), language: z.string().max(20).nullable(), searchVolume: nullableCountSchema,
  volumePeriod: z.string().max(200).nullable(), volumeType: z.enum(["provider_estimate", "relative_interest", "not_available"]), volumeConfidence: confidenceSchema,
  trendIndex: z.number().finite().min(0).max(100).nullable(), trendChangePercent: z.number().finite().nullable(), trendStatus: trendStatusSchema,
  videoCount: z.number().int().nonnegative().nullable(), channelCount: z.number().int().nonnegative().nullable(), averageViews: nullableCountSchema,
  medianViews: nullableCountSchema, competitionScore: z.number().finite().nonnegative().nullable(), evidenceCount: z.number().int().nonnegative(),
  evidence: z.array(evidenceSchema).max(100), provenance: z.array(provenanceSchema).min(1).max(20),
}).superRefine((value, context) => {
  if (value.searchVolume !== null && (value.sourceType !== "keyword_provider" || value.volumeType !== "provider_estimate")) {
    context.addIssue({ code: "custom", message: "Search volume requires keyword-provider provenance.", path: ["searchVolume"] });
  }
});
const termAggregateSchema = z.object({
  term: z.string().min(1).max(1_000), normalizedTerm: z.string().min(1).max(1_000), kind: z.enum(["tag", "hashtag", "title_keyword", "title_phrase"]),
  distinctVideoCount: z.number().int().nonnegative(), distinctChannelCount: z.number().int().nonnegative(), observationCount: z.number().int().nonnegative(),
  currentPrevalence: z.number().finite().min(0).max(1).nullable(), baselineVideoCount: z.number().int().nonnegative().nullable(), baselineSampleSize: z.number().int().nonnegative().nullable(),
  baselinePrevalence: z.number().finite().min(0).max(1).nullable(), baselineObservedAt: timestampSchema.nullable(), averageViews: nullableCountSchema, medianViews: nullableCountSchema,
  firstPublishedAt: timestampSchema, lastPublishedAt: timestampSchema, firstObservedAt: timestampSchema, lastObservedAt: timestampSchema,
  region: z.string().max(20).nullable(), sampleSize: z.number().int().nonnegative(), sourceType: sourceTypeSchema, sourceName: z.string().max(200),
  evidence: z.array(evidenceSchema).max(50), trendStatus: trendStatusSchema, trendChangePercent: z.number().finite().nullable(), trendExplanation: z.string().max(4_000),
  viewGrowthPercent: z.number().finite().nullable(), viewGrowthVideoCount: z.number().int().nonnegative(), viewGrowthExplanation: z.string().max(4_000),
});
const researchSpecificationSchema = z.object({
  query: z.string().min(2).max(120), region: z.string().max(20), language: z.string().max(20), maxResults: z.number().int().min(1).max(50),
  includeSuggestions: z.boolean(), includeGeneratedCandidates: z.boolean(), publishedAfter: timestampSchema.nullable(),
});
const researchResultSchema = z.object({
  specification: researchSpecificationSchema, query: z.string().min(2).max(200), region: z.string().max(20), language: z.string().max(20), retrievedAt: timestampSchema,
  sampleSize: z.number().int().nonnegative().max(50), videos: z.array(videoSchema).max(50), suggestions: z.array(keywordMetricSchema).max(200),
  titleKeywords: z.array(keywordMetricSchema).max(2_000), tags: z.array(keywordMetricSchema).max(2_000), hashtags: z.array(keywordMetricSchema).max(2_000),
  relatedQueries: z.array(keywordMetricSchema).max(2_000), providerMetrics: z.array(keywordMetricSchema).max(2_000), generatedCandidates: z.array(keywordMetricSchema).max(100),
  warnings: z.array(z.string().max(2_000)).max(100),
});
const trendSpecificationSchema = z.object({
  query: z.string().max(120).nullable(), region: z.string().max(20), language: z.string().max(20).nullable(), timeframe: z.string().max(50),
  customStart: timestampSchema.nullable(), customEnd: timestampSchema.nullable(), categoryId: z.string().max(50).nullable(), order: z.enum(["date", "viewCount", "relevance"]),
  contentType: z.enum(["all", "short", "long"]), maxResults: z.number().int().min(1).max(50), discoveryMethod: z.enum(["youtube_search", "youtube_popular"]),
});
const trendResultSchema = z.object({
  specification: trendSpecificationSchema, query: z.string().max(120).nullable(), region: z.string().max(20), language: z.string().max(20).nullable(), timeframe: z.string().max(50),
  windowStart: timestampSchema, windowEnd: timestampSchema, retrievedAt: timestampSchema, sampleSize: z.number().int().nonnegative().max(50),
  discoveryMethod: z.enum(["youtube_search", "youtube_popular"]), videos: z.array(videoSchema).max(50), tags: z.array(termAggregateSchema).max(2_000),
  hashtags: z.array(termAggregateSchema).max(2_000), titleKeywords: z.array(termAggregateSchema).max(2_000), titlePhrases: z.array(termAggregateSchema).max(2_000),
  warnings: z.array(z.string().max(2_000)).max(100),
});
const comparisonVideoSchema = z.object({ video: videoSchema, normalizedTags: z.record(z.string(), z.string().max(1_000)), titleKeywords: z.array(z.string().max(1_000)).max(2_000), hashtags: z.array(z.string().max(200)).max(2_000) });
const competitorSchema = z.object({
  specification: z.object({ inputs: z.array(z.string().max(500)).min(2).max(20), referenceIndex: z.number().int().min(0).max(19), channelLimit: z.number().int().min(1).max(50) }),
  retrievedAt: timestampSchema, referenceVideoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/u), sampleSize: z.number().int().min(2).max(1_000), videos: z.array(comparisonVideoSchema).min(2).max(1_000),
  commonTags: z.array(z.string().max(1_000)).max(5_000), tagsByVideo: z.record(z.string(), z.array(z.string().max(1_000)).max(500)),
  missingFromReference: z.array(z.string().max(1_000)).max(5_000), commonTitleKeywords: z.array(z.string().max(1_000)).max(5_000),
  commonHashtags: z.array(z.string().max(200)).max(5_000), warnings: z.array(z.string().max(2_000)).max(100),
});

const preferencesSchema = z.object({ theme: z.enum(["system", "light", "dark"]), defaultRegion: z.string().regex(/^[A-Z]{2}$/u), defaultLanguage: z.string().min(2).max(20), deduplicateTags: z.boolean(), suggestionsEnabled: z.boolean() });
const projectBase = { id: z.string().min(1).max(200), name: z.string().min(1).max(200), createdAt: timestampSchema, updatedAt: timestampSchema, notes: z.string().max(10_000) };
const savedProjectSchema = z.discriminatedUnion("type", [
  z.object({ ...projectBase, type: z.literal("research"), payload: researchResultSchema }),
  z.object({ ...projectBase, type: z.literal("hashtag"), payload: researchResultSchema }),
  z.object({ ...projectBase, type: z.literal("extraction"), payload: extractionPayloadSchema }),
  z.object({ ...projectBase, type: z.literal("trend"), payload: trendResultSchema }),
  z.object({ ...projectBase, type: z.literal("competitor"), payload: competitorSchema }),
]);
const activitySchema = z.object({ id: z.string().min(1).max(200), operation: z.enum(["research", "extraction", "trend", "competitor", "hashtag"]), label: z.string().max(200), createdAt: timestampSchema, resultCount: z.number().int().nonnegative() });
const exportSchema = z.object({ id: z.string().min(1).max(200), filename: z.string().max(300), format: z.enum(["csv", "json"]), createdAt: timestampSchema, rowCount: z.number().int().nonnegative() });
const trendSnapshotSchema = z.object({ id: z.string().min(1).max(200), fingerprint: z.string().min(1).max(2_000), capturedAt: timestampSchema, result: trendResultSchema });
const workspaceSchema = z.object({
  version: z.literal(1), projects: z.array(savedProjectSchema).max(MAX_PROJECTS), activities: z.array(activitySchema).max(MAX_ACTIVITIES),
  favoriteKeywords: z.array(z.string().max(200)).max(500), comparisonHistory: z.array(competitorSchema).max(50), exportHistory: z.array(exportSchema).max(100),
  trendSnapshots: z.array(trendSnapshotSchema).max(MAX_SNAPSHOTS), preferences: preferencesSchema,
});

export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export interface WorkspaceReadResult { state: WorkspaceState; available: boolean; error: string | null }

export const defaultPreferences: WorkspacePreferences = { theme: "system", defaultRegion: "US", defaultLanguage: "en", deduplicateTags: false, suggestionsEnabled: true };

export function createDefaultWorkspace(): WorkspaceState {
  return { version: WORKSPACE_VERSION, projects: [], activities: [], favoriteKeywords: [], comparisonHistory: [], exportHistory: [], trendSnapshots: [], preferences: { ...defaultPreferences } };
}

export const INVALID_SAVED_WORKSPACE_ERROR = "We couldn’t read your saved workspace, so it has not been changed. Import a valid backup or delete the saved data.";

export function readWorkspace(storage?: StorageLike): WorkspaceReadResult {
  const fallback = createDefaultWorkspace();
  if (!storage) return { state: fallback, available: false, error: "Browser storage is unavailable or disabled. Check your browser settings and try again." };
  try {
    const raw = storage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return { state: fallback, available: true, error: null };
    const parsed: unknown = JSON.parse(raw);
    const validated = workspaceSchema.safeParse(migrateWorkspace(parsed));
    if (!validated.success) return { state: fallback, available: false, error: INVALID_SAVED_WORKSPACE_ERROR };
    return { state: validated.data as WorkspaceState, available: true, error: null };
  } catch {
    return { state: fallback, available: false, error: "We couldn’t read your saved workspace because browser storage is unavailable or disabled. Check your browser settings, then reload the page." };
  }
}

export function writeWorkspace(storage: StorageLike | undefined, state: WorkspaceState): string | null {
  if (!storage) return "Browser storage is unavailable or disabled. Check your browser settings and try again.";
  const validated = workspaceSchema.safeParse(state);
  if (!validated.success) return "We couldn’t verify the workspace data, so it was not saved. Restore a valid backup and try again.";
  const serialized = JSON.stringify(validated.data);
  if (new TextEncoder().encode(serialized).byteLength > MAX_WORKSPACE_BYTES) return "The workspace is larger than 4 MiB, so it was not saved. Export a backup or delete projects, then try again.";
  try { storage.setItem(WORKSPACE_STORAGE_KEY, serialized); return null; }
  catch (error) { return isQuotaError(error) ? "Browser storage is full, so the change was not saved. Export a backup or delete saved projects, then try again." : "The change was not saved because browser storage is unavailable or disabled. Check your browser settings and try again."; }
}

export function importWorkspaceJson(json: string): WorkspaceState {
  if (new TextEncoder().encode(json).byteLength > MAX_IMPORT_BYTES) throw new Error("The selected backup is larger than 5 MiB, so it was not imported. Choose a smaller workspace backup and try again.");
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error("The selected file is not valid JSON, so it was not imported. Choose another workspace backup or fix the file, then try again."); }
  const result = workspaceSchema.safeParse(migrateWorkspace(parsed));
  if (!result.success) throw new Error("The selected file is not a valid SourceLens workspace backup, so it was not imported. Choose a valid backup and try again.");
  return result.data as WorkspaceState;
}

export function exportWorkspaceJson(state: WorkspaceState): string {
  const result = workspaceSchema.safeParse(state);
  if (!result.success) throw new Error("The workspace data is not valid, so it was not exported. Reset the workspace or restore a valid backup, then try again.");
  return JSON.stringify(result.data, null, 2);
}

export function trendFingerprint(result: TrendResult): string {
  const specification = result.specification;
  return JSON.stringify({
    query: normalizeForMatch(specification.query ?? "popular"), region: specification.region, language: specification.language ?? "all",
    timeframe: specification.timeframe, customStart: specification.timeframe === "custom" ? specification.customStart : null,
    customEnd: specification.timeframe === "custom" ? specification.customEnd : null, categoryId: specification.categoryId,
    order: specification.discoveryMethod === "youtube_search" ? specification.order : null, contentType: specification.contentType,
    maxResults: specification.maxResults, discoveryMethod: specification.discoveryMethod,
  });
}

export function createTrendSnapshot(result: TrendResult): TrendSnapshot {
  return { id: createLocalId(), fingerprint: trendFingerprint(result), capturedAt: new Date().toISOString(), result };
}

export function createProject(name: string, type: SavedProject["type"], payload: unknown, notes = ""): SavedProject {
  const now = new Date().toISOString();
  return { id: createLocalId(), name: name.trim().slice(0, 200) || "Untitled research", type, createdAt: now, updatedAt: now, notes, payload };
}

export function createActivity(operation: ActivityEntry["operation"], label: string, resultCount: number): ActivityEntry {
  return { id: createLocalId(), operation, label: label.slice(0, 200), createdAt: new Date().toISOString(), resultCount: Math.max(0, Math.floor(resultCount)) };
}

export function createExportEntry(filename: string, format: ExportEntry["format"], rowCount: number): ExportEntry {
  return { id: createLocalId(), filename, format, createdAt: new Date().toISOString(), rowCount: Math.max(0, Math.floor(rowCount)) };
}

export function limitWorkspace(state: WorkspaceState): WorkspaceState {
  return { ...state, projects: state.projects.slice(0, MAX_PROJECTS), activities: state.activities.slice(0, MAX_ACTIVITIES), exportHistory: state.exportHistory.slice(0, 100), comparisonHistory: state.comparisonHistory.slice(0, 50), trendSnapshots: state.trendSnapshots.slice(0, MAX_SNAPSHOTS), favoriteKeywords: [...new Set(state.favoriteKeywords.map((keyword) => keyword.trim()).filter(Boolean))].slice(0, 500) };
}

function migrateWorkspace(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (record.version === 1) return value;
  if (record.version === undefined) return { ...createDefaultWorkspace(), ...record, version: 1, preferences: { ...defaultPreferences, ...(typeof record.preferences === "object" ? record.preferences : {}) } };
  return value;
}

function createLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function isQuotaError(error: unknown): boolean { return error instanceof DOMException && (error.name === "QuotaExceededError" || error.code === 22); }
