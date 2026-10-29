import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as metadataPost } from "@/app/api/youtube/metadata/route";
import { POST as transcriptPost } from "@/app/api/youtube/transcript/route";
import { POST as summaryPost } from "@/app/api/youtube/summary/route";
import { POST as translatePost } from "@/app/api/youtube/translate/route";

function request(path: string, body: unknown, identity = "test-client") {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": identity,
    },
    body: JSON.stringify(body),
  });
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("YouTube Transcript & AI Summary route handlers", () => {
  beforeEach(() => {
    vi.stubEnv("YOUTUBE_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe("POST /api/youtube/metadata", () => {
    it("returns video metadata via oEmbed fallback when API key is unset", async () => {
      const oembedData = {
        title: "Test Video Title",
        author_name: "Test Author",
        author_url: "https://www.youtube.com/@test",
        thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(oembedData)));

      const res = await metadataPost(
        request("/api/youtube/metadata", { input: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data).toMatchObject({
        id: "dQw4w9WgXcQ",
        title: "Test Video Title",
        channelTitle: "Test Author",
      });
    });

    it("rejects invalid input URL with 400", async () => {
      const res = await metadataPost(request("/api/youtube/metadata", { input: "not-a-youtube-url" }));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("INVALID_YOUTUBE_URL");
    });
  });

  describe("POST /api/youtube/transcript", () => {
    it("rejects invalid video input with 400", async () => {
      const res = await transcriptPost(request("/api/youtube/transcript", { input: "" }));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
    });

    it("retrieves transcript payload with accurate structure", async () => {
      const { YoutubeTranscript } = await import("youtube-transcript");
      vi.spyOn(YoutubeTranscript, "fetchTranscript").mockResolvedValue([
        { text: "Hello and welcome", offset: 1000, duration: 2500, lang: "en" },
        { text: "to this episode", offset: 3500, duration: 2000, lang: "en" },
      ]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({
            title: "Mock Video",
            author_name: "Mock Channel",
            thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
          }),
        ),
      );

      const res = await transcriptPost(
        request("/api/youtube/transcript", { input: "https://youtu.be/dQw4w9WgXcQ" }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.segments).toHaveLength(2);
      expect(body.data.segments[0]).toMatchObject({
        text: "Hello and welcome",
        timestamp: "00:01",
      });
      expect(body.data.wordCount).toBe(6);
      expect(body.data.sourceLanguage).toBe("en");
    });

    it("translates English transcript to Hindi Devanagari when outputLanguage is hi", async () => {
      const { YoutubeTranscript } = await import("youtube-transcript");
      vi.spyOn(YoutubeTranscript, "fetchTranscript").mockResolvedValue([
        { text: "Hello and welcome", offset: 1000, duration: 2500, lang: "en" },
      ]);
      const mockTranslation = [[["नमस्ते और स्वागत है", "Hello and welcome", null, null]]];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string | URL) => {
          const urlStr = String(url);
          if (urlStr.includes("translate_a/single")) {
            return Promise.resolve(jsonResponse(mockTranslation));
          }
          return Promise.resolve(
            jsonResponse({
              title: "Mock Video",
              author_name: "Mock Channel",
              thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
            }),
          );
        }),
      );

      const res = await transcriptPost(
        request("/api/youtube/transcript", {
          input: "https://youtu.be/dQw4w9WgXcQ",
          outputLanguage: "hi",
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.sourceLanguage).toBe("en");
      expect(body.data.outputLanguage).toBe("hi");
      expect(body.data.isTranslated).toBe(true);
      expect(body.data.segments[0].text).toBe("नमस्ते और स्वागत है");
      expect(body.data.originalSegments[0].text).toBe("Hello and welcome");
    });

    it("keeps Hindi video with Hindi captions as Hindi in Auto-detect mode without translation", async () => {
      const { YoutubeTranscript } = await import("youtube-transcript");
      vi.spyOn(YoutubeTranscript, "fetchTranscript").mockResolvedValue([
        { text: "रिश्ता वही खूबसूरत होता है", offset: 1000, duration: 2500, lang: "hi" },
      ]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({
            title: "🔥 पति-पत्नी के बीच ये बातें! 😢🙏",
            author_name: "Inspirational Quotes",
            thumbnail_url: "https://i.ytimg.com/vi/BpqEl8VMRXU/hqdefault.jpg",
          }),
        ),
      );

      const res = await transcriptPost(
        request("/api/youtube/transcript", {
          input: "https://youtu.be/BpqEl8VMRXU",
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.sourceLanguage).toBe("hi");
      expect(body.data.sourceLanguageName).toContain("Hindi");
      expect(body.data.outputLanguage).toBe("hi");
      expect(body.data.isTranslated).toBe(false);
      expect(body.data.segments[0].text).toBe("रिश्ता वही खूबसूरत होता है");
    });

    it("preserves original transcript when translation fails and returns 502 with honest error", async () => {
      const { YoutubeTranscript } = await import("youtube-transcript");
      vi.spyOn(YoutubeTranscript, "fetchTranscript").mockResolvedValue([
        { text: "Hello and welcome", offset: 1000, duration: 2500, lang: "en" },
      ]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string | URL) => {
          const urlStr = String(url);
          if (urlStr.includes("translate_a/single")) {
            return Promise.reject(new Error("Translation API network failure"));
          }
          return Promise.resolve(
            jsonResponse({
              title: "Mock Video",
              author_name: "Mock Channel",
              thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
            }),
          );
        }),
      );

      const res = await transcriptPost(
        request("/api/youtube/transcript", {
          input: "https://youtu.be/dQw4w9WgXcQ",
          outputLanguage: "hi",
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(502);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("TRANSLATION_FAILED");
    });
  });

  describe("POST /api/youtube/summary", () => {
    it("returns honest 503 error when AI provider is not configured", async () => {
      const res = await summaryPost(
        request("/api/youtube/summary", {
          videoId: "dQw4w9WgXcQ",
          transcript: "This is a full video transcript talking about software engineering and tests.",
          summaryType: "concise",
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("AI_KEY_NOT_CONFIGURED");
      expect(body.error.message).toContain("AI summarization service is not configured");
    });

    it("generates structured summary when OPENAI_API_KEY is configured", async () => {
      vi.stubEnv("OPENAI_API_KEY", "mock-key-for-test");
      const mockCompletion = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                overview: "A concise overview of the test video.",
                keyTakeaways: ["Takeaway 1", "Takeaway 2"],
                sections: [
                  {
                    title: "Section 1",
                    points: ["Point A", "Point B"],
                  },
                ],
              }),
            },
          },
        ],
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(mockCompletion)));

      const res = await summaryPost(
        request("/api/youtube/summary", {
          videoId: "dQw4w9WgXcQ",
          transcript: "Hello and welcome. Today we discuss important testing topics.",
          summaryType: "concise",
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.overview).toBe("A concise overview of the test video.");
      expect(body.data.keyTakeaways).toEqual(["Takeaway 1", "Takeaway 2"]);
      expect(body.data.sections[0]!.title).toBe("Section 1");
    });
  });

  describe("POST /api/youtube/translate", () => {
    it("translates segments preserving start and timestamp attributes", async () => {
      const mockTranslation = [[["Hola mundo", "Hello world", null, null]]];
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(mockTranslation)));

      const res = await translatePost(
        request("/api/youtube/translate", {
          segments: [{ text: "Hello world", start: 5, duration: 2, timestamp: "00:05" }],
          targetLanguage: "es",
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.targetLanguage).toBe("es");
      expect(body.data.segments[0]).toMatchObject({
        text: "Hola mundo",
        start: 5,
        duration: 2,
        timestamp: "00:05",
      });
    });
  });
});
