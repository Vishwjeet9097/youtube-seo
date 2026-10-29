import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { externalDataCache } from "@/lib/api/cache";
import { YouTubeDataProvider } from "@/lib/providers/youtube";

const videoPayload = (tags?: string[]) => ({
  items: [{
    id: "dQw4w9WgXcQ",
    snippet: {
      publishedAt: "2026-10-26T10:00:00Z",
      channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
      title: "TEST FIXTURE #Evidence",
      description: "TEST FIXTURE description #Research",
      channelTitle: "TEST FIXTURE Channel",
      ...(tags === undefined ? {} : { tags }),
      categoryId: "27",
      thumbnails: { high: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" } },
    },
    statistics: { viewCount: "1234", likeCount: "55" },
    contentDetails: { duration: "PT2M3S" },
  }],
});

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("YouTubeDataProvider with mocked official API responses", () => {
  beforeEach(() => { externalDataCache.clear(); vi.unstubAllGlobals(); });
  afterEach(() => vi.unstubAllGlobals());

  it("maps actual public tags, hashtags, counts, duration, and provenance time", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(videoPayload(["Original Tag", "दिवाली गीत"])));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new YouTubeDataProvider("TEST_ONLY_API_KEY").listVideos(["dQw4w9WgXcQ"], "IN");
    expect(result.data[0]).toMatchObject({
      tags: ["Original Tag", "दिवाली गीत"],
      tagStatus: "found",
      hashtags: { title: ["#Evidence"], description: ["#Research"] },
      statistics: { viewCount: 1234, likeCount: 55, commentCount: null },
      durationSeconds: 123,
      region: "IN",
    });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.origin).toBe("https://www.googleapis.com");
    expect(requestedUrl.searchParams.get("key")).toBe("TEST_ONLY_API_KEY");
  });

  it("reports an accessible missing tag array as empty without inference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(videoPayload())));
    const video = (await new YouTubeDataProvider("TEST_ONLY_API_KEY").listVideos(["dQw4w9WgXcQ"])).data[0]!;
    expect(video.tags).toEqual([]);
    expect(video.tagStatus).toBe("empty");
    expect(video.tags).not.toContain("TEST FIXTURE");
  });

  it("performs search then metadata hydration through fixed Google endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: [{ id: { videoId: "dQw4w9WgXcQ" } }] }))
      .mockResolvedValueOnce(response(videoPayload(["Observed Tag"])));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new YouTubeDataProvider("TEST_ONLY_API_KEY").searchVideos({ query: "test query", region: "US", language: "en", maxResults: 10, order: "relevance" });
    expect(result.data).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe("/youtube/v3/search");
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).pathname).toBe("/youtube/v3/videos");
  });

  it("resolves a channel uploads playlist and hydrates recent videos", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: [{ id: "UCaaaaaaaaaaaaaaaaaaaaaa", contentDetails: { relatedPlaylists: { uploads: "UUaaaaaaaaaaaaaaaaaaaaaa" } } }] }))
      .mockResolvedValueOnce(response({ items: [{ contentDetails: { videoId: "dQw4w9WgXcQ" } }] }))
      .mockResolvedValueOnce(response(videoPayload(["Channel Tag"])));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new YouTubeDataProvider("TEST_ONLY_API_KEY").channelVideos({ handle: "@fixture" }, 10);
    expect(result.data[0]?.tags).toEqual(["Channel Tag"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("turns quota exhaustion into a useful non-secret error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { errors: [{ reason: "quotaExceeded" }], message: "TEST ONLY" } }, 403)));
    await expect(new YouTubeDataProvider("SECRET_MUST_NOT_LEAK").listVideos(["dQw4w9WgXcQ"]))
      .rejects.toMatchObject({ code: "YOUTUBE_QUOTA_EXCEEDED", status: 429, retryable: false });
    await expect(new YouTubeDataProvider("SECRET_MUST_NOT_LEAK").listVideos(["dQw4w9WgXcQ"]))
      .rejects.not.toThrow("SECRET_MUST_NOT_LEAK");
  });

  it("rejects use when no API key is configured", async () => {
    await expect(new YouTubeDataProvider("").listVideos(["dQw4w9WgXcQ"]))
      .rejects.toMatchObject({ code: "YOUTUBE_NOT_CONFIGURED", status: 503 });
  });
});
