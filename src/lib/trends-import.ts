import { googleTrendsImportRowSchema } from "@/lib/schemas";
import { parseCsv } from "@/lib/csv";
import type { KeywordMetric, MetricProvenance, SourceEvidence } from "@/types/research";

export interface GoogleTrendsImportRow {
  keyword: string;
  trendIndex: number;
  observedAt: string;
  region: string;
  timeframe: string;
  searchProperty: string;
}

const REQUIRED_HEADERS = ["keyword", "trendindex", "observedat", "region", "timeframe", "searchproperty"] as const;
const REQUIRED_HEADER_FIELDS = {
  keyword: "keyword",
  trendindex: "trendIndex",
  observedat: "observedAt",
  region: "region",
  timeframe: "timeframe",
  searchproperty: "searchProperty",
} as const satisfies Record<(typeof REQUIRED_HEADERS)[number], keyof GoogleTrendsImportRow>;
const DOCUMENTED_FIELD_NAMES = {
  keyword: "keyword",
  trendIndex: "trendIndex",
  observedAt: "observedAt",
  region: "region",
  timeframe: "timeframe",
  searchProperty: "searchProperty",
} as const satisfies Record<keyof GoogleTrendsImportRow, string>;

export function parseGoogleTrendsImport(text: string, filename = "import.csv"): GoogleTrendsImportRow[] {
  if (new TextEncoder().encode(text).byteLength > 2 * 1024 * 1024) throw new Error("Choose a Google Trends file that is 2 MiB or smaller, then try again.");
  let values: unknown[];
  if (filename.toLocaleLowerCase().endsWith(".json")) {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error("Fix the Google Trends JSON or choose another file, then try again. The selected file is invalid."); }
    if (!Array.isArray(parsed)) throw new Error("Use a Google Trends JSON file that contains an array of rows.");
    values = parsed;
  } else {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("Add a header and at least one data row to the Google Trends CSV, then try again.");
    const headers = rows[0]!.map(normalizeHeader);
    const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
    if (missing.length) throw new Error(`Add the missing required columns to the Google Trends CSV, then try again: ${missing.map((header) => REQUIRED_HEADER_FIELDS[header]).join(", ")}.`);
    values = rows.slice(1).filter((row) => row.some((cell) => cell.trim())).map((row) => Object.fromEntries(headers.map((header, index) => [canonicalHeader(header), row[index] ?? ""])));
  }
  if (values.length > 5_000) throw new Error("Remove extra rows, then try again. Google Trends imports can contain up to 5,000 rows.");
  const parsedRows: GoogleTrendsImportRow[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const parsed = googleTrendsImportRowSchema.safeParse(values[index]);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const issueField = issue?.path[0];
      const fieldName = typeof issueField === "string" && issueField in DOCUMENTED_FIELD_NAMES
        ? DOCUMENTED_FIELD_NAMES[issueField as keyof typeof DOCUMENTED_FIELD_NAMES]
        : null;
      if (fieldName) throw new Error(`Google Trends data row ${index + 1} has an invalid “${fieldName}” value: ${issue?.message ?? "check this field"}`);
      throw new Error(`Google Trends data row ${index + 1} is invalid: ${issue?.message ?? "check the row values"}`);
    }
    parsedRows.push(parsed.data);
  }
  return parsedRows;
}

export function trendsRowsToMetrics(rows: readonly GoogleTrendsImportRow[], artifactName = "imported file"): KeywordMetric[] {
  const safeArtifactName = artifactName.trim().slice(0, 100) || "imported file";
  const sourceName = `Imported Google Trends data · ${safeArtifactName}`;
  return rows.map((row, index) => {
    const evidence: SourceEvidence = {
      id: `trends-import:${index}:${row.keyword}:${row.observedAt}`,
      sourceType: "google_trends",
      sourceName,
      sourceUrl: "https://trends.google.com/trends/",
      observedAt: row.observedAt,
      region: row.region,
      language: null,
      videoId: null,
      channelId: null,
      detail: `Imported relative interest: ${row.trendIndex}/100; timeframe: ${row.timeframe}; search property: ${row.searchProperty}.`,
    };
    const provenance: MetricProvenance = {
      metric: "imported relative interest",
      sourceType: "google_trends",
      sourceName,
      observedAt: row.observedAt,
      methodology: `We checked the required fields and values in this imported row for ${row.region}, ${row.timeframe}, using “${row.searchProperty}”. We did not verify where the file came from. This is not absolute search volume.`,
      sampleSize: null,
      confidence: "unavailable",
    };
    return {
      keyword: row.keyword,
      sourceType: "google_trends",
      sourceName,
      sourceUrl: "https://trends.google.com/trends/",
      observedAt: row.observedAt,
      region: row.region,
      language: null,
      searchVolume: null,
      volumePeriod: row.timeframe,
      volumeType: "relative_interest",
      volumeConfidence: "unavailable",
      trendIndex: row.trendIndex,
      trendChangePercent: null,
      trendStatus: "new_observation",
      videoCount: null,
      channelCount: null,
      averageViews: null,
      medianViews: null,
      competitionScore: null,
      evidenceCount: 1,
      evidence: [evidence],
      provenance: [provenance],
    } satisfies KeywordMetric;
  });
}

function normalizeHeader(value: string): string { return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]/gu, ""); }
function canonicalHeader(header: string): string {
  const map: Record<string, string> = { keyword: "keyword", trendindex: "trendIndex", observedat: "observedAt", region: "region", timeframe: "timeframe", searchproperty: "searchProperty" };
  return map[header] ?? header;
}
