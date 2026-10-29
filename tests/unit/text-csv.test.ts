import { describe, expect, it } from "vitest";
import { escapeCsvCell, parseCsv, safeFilename, toCsv } from "@/lib/csv";
import { dedupePreservingOriginal, extractHashtags, generatePotentialVariations, normalizeForMatch, tagCharacterUsage } from "@/lib/text";
import { parseGoogleTrendsImport, trendsRowsToMetrics } from "@/lib/trends-import";

describe("Unicode text analysis", () => {
  it("extracts Unicode and Devanagari hashtags without losing spelling", () => {
    expect(extractHashtags("गीत #छठ_पूजा और #ChhathPuja; duplicate #छठ_पूजा")).toEqual(["#छठ_पूजा", "#ChhathPuja"]);
  });

  it("normalizes compatibility forms and whitespace while preserving non-Latin script", () => {
    expect(normalizeForMatch("  Ｃｈｈａｔｈ   पूजा  ")).toBe("chhath पूजा");
  });

  it("deduplicates case-insensitively and retains the first display label", () => {
    expect(dedupePreservingOriginal(["Chhath Puja", "chhath   puja", "छठ पूजा", "छठ पूजा"])).toEqual(["Chhath Puja", "छठ पूजा"]);
  });

  it("calculates the comma-separated tag budget", () => {
    expect(tagCharacterUsage(["one", "two words"])).toBe(13);
    expect(tagCharacterUsage([])).toBe(0);
  });

  it("marks deterministic candidates as candidates rather than observations", () => {
    const candidates = generatePotentialVariations("Chhath Puja");
    expect(candidates).toContain("ChhathPuja");
    expect(candidates).not.toContain("Chhath Puja");
  });
});

describe("CSV and manual Trends imports", () => {
  it("escapes commas, quotes, Unicode, and line breaks", () => {
    expect(escapeCsvCell('गीत, "live"\nnext')).toBe('"गीत, ""live""\nnext"');
    const csv = toCsv([{ name: 'A, "B"', note: "लाइन\nदो" }], [{ header: "Name", value: (row) => row.name }, { header: "Note", value: (row) => row.note }]);
    expect(parseCsv(csv)).toEqual([["Name", "Note"], ['A, "B"', "लाइन\nदो"]]);
  });

  it("creates useful sanitized export filenames", () => {
    expect(safeFilename("Chhath Puja / Tags", "csv", new Date("2026-10-27T00:00:00Z"))).toBe("chhath-puja-tags-2026-10-27.csv");
  });

  it("validates Trends CSV provenance and keeps volume null", () => {
    const rows = parseGoogleTrendsImport("keyword,trendIndex,observedAt,region,timeframe,searchProperty\r\nछठ पूजा,82,2026-10-27T00:00:00.000Z,IN,past 7 days,YouTube Search\r\n");
    const metric = trendsRowsToMetrics(rows)[0]!;
    expect(metric.keyword).toBe("छठ पूजा");
    expect(metric.trendIndex).toBe(82);
    expect(metric.searchVolume).toBeNull();
    expect(metric.volumeType).toBe("relative_interest");
    expect(metric.provenance[0]?.methodology).toContain("not absolute search volume");
  });

  it("rejects malformed or incomplete imports", () => {
    expect(() => parseGoogleTrendsImport("keyword,trendIndex\nterm,50\n")).toThrow("missing required columns");
    expect(() => parseGoogleTrendsImport("not json", "data.json")).toThrow("invalid");
  });
});
