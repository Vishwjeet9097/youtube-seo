import { z } from "zod";

const regionSchema = z.string({ error: "Enter a region code." }).trim().regex(/^[A-Z]{2}$/u, "Use a two-letter uppercase region code, such as US.");
const languageSchema = z.string({ error: "Enter a language code." }).trim().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/u, "Use a valid language code, such as en or en-US.");
const isoTimestampSchema = z.iso.datetime({ offset: true, error: "Use a date and time with a time zone, such as 2026-01-31T12:00:00Z." });
const DAY_MS = 86_400_000;

export const extractRequestSchema = z.object({
  inputs: z.array(
    z.string({ error: "Enter each YouTube item as text." })
      .trim()
      .min(1, "Remove blank entries or enter a YouTube link, ID, or @handle.")
      .max(500, "Keep each YouTube entry to 500 characters or fewer."),
    { error: "Enter YouTube links, IDs, or @handles as a list." },
  ).min(1, "Enter at least one YouTube link, ID, or @handle.").max(20, "Use no more than 20 YouTube links, IDs, or @handles."),
  channelLimit: z.number({ error: "Enter the channel video limit as a number." })
    .int("Use a whole number for the channel video limit.")
    .min(1, "Use at least one video per channel.")
    .max(50, "Use no more than 50 videos per channel.")
    .default(20),
});

export const researchRequestSchema = z.object({
  query: z.string({ error: "Enter a search topic." })
    .trim()
    .min(2, "Enter at least 2 characters for the search topic.")
    .max(120, "Keep the search topic to 120 characters or fewer."),
  region: regionSchema.default("US"),
  language: languageSchema.default("en"),
  maxResults: z.number({ error: "Enter the result limit as a number." })
    .int("Use a whole number for the result limit.")
    .min(1, "Request at least one result.")
    .max(50, "Request no more than 50 results.")
    .default(25),
  includeSuggestions: z.boolean({ error: "Choose whether to include suggestions." }).default(true),
  includeGeneratedCandidates: z.boolean({ error: "Choose whether to include generated ideas." }).default(false),
  publishedAfter: isoTimestampSchema.optional(),
});

export const timeframeSchema = z.enum(["24h", "48h", "7d", "28d", "custom"], {
  error: "Choose 24 hours, 48 hours, 7 days, 28 days, or a custom range.",
});

export const trendingRequestSchema = z.object({
  query: z.string({ error: "Enter the search topic as text." })
    .trim()
    .max(120, "Keep the search topic to 120 characters or fewer.")
    .optional()
    .transform((value) => value || undefined),
  region: regionSchema.default("US"),
  language: languageSchema.optional(),
  timeframe: timeframeSchema.default("24h"),
  customStart: isoTimestampSchema.optional(),
  customEnd: isoTimestampSchema.optional(),
  categoryId: z.string({ error: "Choose a valid video category." }).trim().regex(/^\d+$/u, "Use digits only for the category ID.").optional(),
  order: z.enum(["date", "viewCount", "relevance"], { error: "Choose date, view count, or relevance for the sort order." }).default("viewCount"),
  contentType: z.enum(["all", "short", "long"], { error: "Choose all, short, or long videos." }).default("all"),
  maxResults: z.number({ error: "Enter the result limit as a number." })
    .int("Use a whole number for the result limit.")
    .min(1, "Request at least one result.")
    .max(50, "Request no more than 50 results.")
    .default(50),
}).superRefine((value, context) => {
  if (value.timeframe !== "custom") return;
  if (!value.customStart || !value.customEnd) {
    context.addIssue({ code: "custom", message: "Enter both a custom start and end time.", path: ["customStart"] });
    return;
  }
  const start = new Date(value.customStart).getTime();
  const end = new Date(value.customEnd).getTime();
  if (start >= end) context.addIssue({ code: "custom", message: "Choose a start time before the end time.", path: ["customStart"] });
  if (end > Date.now() + 60_000) context.addIssue({ code: "custom", message: "Choose an end time that is not in the future.", path: ["customEnd"] });
  if (end - start > 90 * DAY_MS) context.addIssue({ code: "custom", message: "Use a custom date range of 90 days or less.", path: ["customEnd"] });
});

export const competitorRequestSchema = z.object({
  inputs: z.array(
    z.string({ error: "Enter each YouTube item as text." })
      .trim()
      .min(1, "Remove blank entries or enter a YouTube link, ID, or @handle.")
      .max(500, "Keep each YouTube entry to 500 characters or fewer."),
    { error: "Enter YouTube links, IDs, or @handles as a list." },
  ).min(2, "Enter at least two YouTube links, IDs, or @handles.").max(20, "Use no more than 20 YouTube links, IDs, or @handles."),
  referenceIndex: z.number({ error: "Choose a reference entry from your list." })
    .int("Choose a reference entry from your list.")
    .min(0, "Choose a reference entry from your list.")
    .max(19, "Choose a reference entry from your list.")
    .default(0),
  channelLimit: z.number({ error: "Enter the channel video limit as a number." })
    .int("Use a whole number for the channel video limit.")
    .min(1, "Use at least one video per channel.")
    .max(50, "Use no more than 50 videos per channel.")
    .default(10),
});

export const suggestionRequestSchema = z.object({
  query: z.string({ error: "Enter a topic for suggestions." })
    .trim()
    .min(2, "Enter at least 2 characters for suggestions.")
    .max(120, "Keep the topic to 120 characters or fewer."),
  region: regionSchema.default("US"),
  language: languageSchema.default("en"),
});

export const googleTrendsImportRowSchema = z.object({
  keyword: z.string({ error: "Enter a keyword." })
    .trim()
    .min(1, "Enter a keyword.")
    .max(200, "Keep the keyword to 200 characters or fewer."),
  trendIndex: z.coerce.number({ error: "Enter the trend score as a number." })
    .min(0, "Use a trend score of 0 or more.")
    .max(100, "Use a trend score of 100 or less."),
  observedAt: isoTimestampSchema,
  region: z.string({ error: "Enter a region." })
    .trim()
    .min(2, "Use at least 2 characters for the region.")
    .max(10, "Keep the region to 10 characters or fewer."),
  timeframe: z.string({ error: "Enter a time range." })
    .trim()
    .min(1, "Enter a time range.")
    .max(100, "Keep the time range to 100 characters or fewer."),
  searchProperty: z.string({ error: "Enter a search property." })
    .trim()
    .min(1, "Enter a search property.")
    .max(100, "Keep the search property to 100 characters or fewer."),
}).superRefine((value, context) => {
  if (new Date(value.observedAt).getTime() > Date.now() + 5 * 60_000) {
    context.addIssue({ code: "custom", message: "Choose an observed time that is not in the future.", path: ["observedAt"] });
  }
});

export type ExtractRequest = z.infer<typeof extractRequestSchema>;
export type ResearchRequest = z.infer<typeof researchRequestSchema>;
export type TrendingRequest = z.infer<typeof trendingRequestSchema>;
export type CompetitorRequest = z.infer<typeof competitorRequestSchema>;

export const youtubeMetadataRequestSchema = z.object({
  input: z.string({ error: "Enter a YouTube video URL or ID." })
    .trim()
    .min(1, "Enter a YouTube video URL or ID.")
    .max(500, "Keep the link or ID to 500 characters or fewer."),
});

export const youtubeTranscriptRequestSchema = z.object({
  input: z.string({ error: "Enter a YouTube video URL or ID." })
    .trim()
    .min(1, "Enter a YouTube video URL or ID.")
    .max(500, "Keep the link or ID to 500 characters or fewer."),
  lang: z.string().trim().max(15).optional(),
  trackLanguage: z.string().trim().max(15).optional(),
  outputLanguage: z.string().trim().max(15).optional(),
});

export const youtubeSummaryRequestSchema = z.object({
  videoId: z.string({ error: "Provide a valid video ID." })
    .trim()
    .min(1, "Provide a valid video ID.")
    .max(64, "Video ID is too long."),
  transcript: z.string({ error: "Provide transcript text to summarize." })
    .trim()
    .min(10, "Transcript text must contain at least 10 characters to summarize.")
    .max(500_000, "Transcript exceeds the maximum supported length."),
  summaryType: z.enum(["concise", "detailed"], { error: "Choose concise or detailed summary." }).default("concise"),
  language: z.string().trim().max(20).optional(),
});

export const youtubeTranslateRequestSchema = z.object({
  text: z.string().trim().max(500_000).optional(),
  segments: z.array(
    z.object({
      text: z.string(),
      start: z.number(),
      duration: z.number(),
      timestamp: z.string(),
    })
  ).optional(),
  targetLanguage: z.string({ error: "Select a target language." })
    .trim()
    .min(2, "Language code must be at least 2 characters.")
    .max(15, "Language code must be 15 characters or fewer."),
  sourceLanguage: z.string().trim().max(15).optional(),
}).refine((data) => Boolean(data.text || (data.segments && data.segments.length > 0)), {
  message: "Provide either full text or transcript segments to translate.",
});

export type YouTubeMetadataRequest = z.infer<typeof youtubeMetadataRequestSchema>;
export type YouTubeTranscriptRequest = z.infer<typeof youtubeTranscriptRequestSchema>;
export type YouTubeSummaryRequest = z.infer<typeof youtubeSummaryRequestSchema>;
export type YouTubeTranslateRequest = z.infer<typeof youtubeTranslateRequestSchema>;

