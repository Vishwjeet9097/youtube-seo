import { describe, expect, it } from "vitest";
import { isAllowedYouTubeHostname, isValidChannelId, isValidVideoId, parseYouTubeInput, parseYouTubeInputLines } from "@/lib/youtube-url";

const id = "dQw4w9WgXcQ";

describe("YouTube input parsing", () => {
  it.each([
    id,
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=test-only`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}?feature=share`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://m.youtube.com/v/${id}`,
  ])("normalizes supported video input %s", (input) => {
    expect(parseYouTubeInput(input)).toMatchObject({ kind: "video", id });
  });

  it("validates exact video and channel ID shapes", () => {
    expect(isValidVideoId(id)).toBe(true);
    expect(isValidVideoId(`${id}x`)).toBe(false);
    expect(isValidChannelId("UCaaaaaaaaaaaaaaaaaaaaaa")).toBe(true);
    expect(isValidChannelId("UCshort")).toBe(false);
  });

  it.each([
    ["https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa", { id: "UCaaaaaaaaaaaaaaaaaaaaaa" }],
    ["https://youtube.com/@evidence.test", { handle: "@evidence.test" }],
    ["@evidence-test", { handle: "@evidence-test" }],
    ["https://youtube.com/user/LegacyTest", { legacyName: "LegacyTest" }],
  ])("recognizes supported channel reference %s", (input, expected) => {
    expect(parseYouTubeInput(input)).toMatchObject({ kind: "channel", ...expected });
  });

  it.each([
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "https://evil.test/?url=https://youtube.com/watch?v=dQw4w9WgXcQ",
    "ftp://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com:444/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
  ])("rejects unsafe or non-YouTube URL %s", (input) => {
    expect(parseYouTubeInput(input).kind).toBe("invalid");
  });

  it("enforces bounded line batches", () => {
    expect(() => parseYouTubeInputLines(Array.from({ length: 21 }, () => id).join("\n"))).toThrow("maximum of 20");
  });

  it("uses an exact hostname allowlist", () => {
    expect(isAllowedYouTubeHostname("youtube.com")).toBe(true);
    expect(isAllowedYouTubeHostname("youtube.com.evil.test")).toBe(false);
  });
});
