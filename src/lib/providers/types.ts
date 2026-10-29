import type { SuggestionObservation, VideoRecord } from "@/types/research";

export interface VideoSearchOptions {
  query: string;
  region: string;
  language?: string;
  publishedAfter?: string;
  publishedBefore?: string;
  maxResults: number;
  order: "date" | "viewCount" | "relevance";
  categoryId?: string;
}

export interface PopularVideoOptions {
  region: string;
  maxResults: number;
  categoryId?: string;
}

export interface ProviderResult<T> {
  data: T;
  retrievedAt: string;
  cached: boolean;
  cacheAgeSeconds: number | null;
  warnings: string[];
}

export interface ProviderStatus {
  id: string;
  name: string;
  configured: boolean;
  live: boolean;
  supplies: string[];
  limitation: string;
}

export interface VideoDataProvider {
  readonly status: ProviderStatus;
  listVideos(ids: readonly string[], region?: string | null): Promise<ProviderResult<VideoRecord[]>>;
  searchVideos(options: VideoSearchOptions): Promise<ProviderResult<VideoRecord[]>>;
  popularVideos(options: PopularVideoOptions): Promise<ProviderResult<VideoRecord[]>>;
  channelVideos(reference: { id?: string | null; handle?: string | null; legacyName?: string | null }, limit: number): Promise<ProviderResult<VideoRecord[]>>;
}

export interface SuggestionProvider {
  readonly status: ProviderStatus;
  getSuggestions(query: string, region: string, language: string): Promise<ProviderResult<SuggestionObservation[]>>;
}

export interface TrendsProvider {
  readonly status: ProviderStatus;
}

export interface KeywordVolumeProvider {
  readonly status: ProviderStatus;
}
