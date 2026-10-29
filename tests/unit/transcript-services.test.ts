import { describe, expect, it } from "vitest";
import { extractVideoId } from "@/lib/services/metadata";
import {
  cleanTranscriptText,
  detectLanguageFromText,
  formatTimestamp,
  formatTranscriptIntoParagraphs,
  normalizeSegments,
  serializeTranscript,
  stripTimestampMarkers,
} from "@/lib/services/transcript";
import {
  detectLanguageFromContent,
  selectBestCaptionTrack,
  type DiscoveredCaptionTrack,
} from "@/lib/services/youtube-captions";
import { TranscriptCache } from "@/lib/services/transcript-cache";
import type { TranscriptPayload } from "@/types/research";
import { chunkText } from "@/lib/services/ai-summary";
import {
  registerSpeechToTextProvider,
  createMockSttResult,
  transcribeWithSpeechToText,
  type SpeechToTextProvider,
} from "@/lib/services/speech-to-text";

describe("Transcript unit utilities", () => {
  describe("extractVideoId", () => {
    it("extracts from standard watch URL", () => {
      expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts from short youtu.be URL", () => {
      expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts from Shorts URL", () => {
      expect(extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts from Embed URL", () => {
      expect(extractVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("accepts clean 11-character video ID directly", () => {
      expect(extractVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("rejects non-video links or channel links", () => {
      expect(() => extractVideoId("https://www.youtube.com/@mkbhd")).toThrow();
      expect(() => extractVideoId("not-a-link")).toThrow();
    });
  });

  describe("formatTimestamp", () => {
    it("formats minutes and seconds accurately", () => {
      expect(formatTimestamp(0)).toBe("00:00");
      expect(formatTimestamp(65)).toBe("01:05");
      expect(formatTimestamp(599)).toBe("09:59");
    });

    it("formats hours, minutes, and seconds for longer videos", () => {
      expect(formatTimestamp(3665)).toBe("1:01:05");
      expect(formatTimestamp(7200)).toBe("2:00:00");
    });
  });

  describe("detectLanguageFromText", () => {
    it("identifies Devanagari script as Hindi", () => {
      const result = detectLanguageFromText("नमस्ते दोस्तों, इस वीडियो में हम बात करेंगे");
      expect(result.code).toBe("hi");
      expect(result.name).toContain("Hindi");
    });

    it("identifies Bengali script", () => {
      const result = detectLanguageFromText("সবাই কেমন আছেন?");
      expect(result.code).toBe("bn");
      expect(result.name).toContain("Bengali");
    });

    it("identifies Arabic script", () => {
      const result = detectLanguageFromText("مرحبا بكم في هذا الفيديو");
      expect(result.code).toBe("ar");
      expect(result.name).toContain("Arabic");
    });

    it("defaults to specified or English for Latin scripts", () => {
      const result = detectLanguageFromText("Hello everyone, welcome back to the channel", "en");
      expect(result.code).toBe("en");
      expect(result.name).toBe("English");
    });
  });

  describe("cleanTranscriptText and normalizeSegments", () => {
    it("decodes HTML entities and normalizes whitespace", () => {
      expect(cleanTranscriptText("It&#39;s &amp; they said &quot;hello&quot;")).toBe("It's & they said \"hello\"");
    });

    it("normalizes segments with accurate seconds and timestamps", () => {
      const raw = [
        { text: "Welcome to", offset: 1200, duration: 2000 },
        { text: "this tutorial", offset: 3200, duration: 1800 },
      ];
      const segments = normalizeSegments(raw);
      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({
        text: "Welcome to",
        start: 1.2,
        duration: 2,
        timestamp: "00:01",
      });
      expect(segments[1]).toEqual({
        text: "this tutorial",
        start: 3.2,
        duration: 1.8,
        timestamp: "00:03",
      });
    });

    it("deduplicates identical immediate repetitions", () => {
      const raw = [
        { text: "hello", offset: 1000, duration: 1000 },
        { text: "hello", offset: 2000, duration: 1000 },
        { text: "world", offset: 3000, duration: 1000 },
      ];
      const segments = normalizeSegments(raw);
      expect(segments).toHaveLength(2);
      expect(segments[0]!.text).toBe("hello");
      expect(segments[1]!.text).toBe("world");
    });
  });

  describe("stripTimestampMarkers", () => {
    it("strips bracketed timestamps from beginning and middle of dialogue", () => {
      expect(stripTimestampMarkers("[00:05] Hello world")).toBe("Hello world");
      expect(stripTimestampMarkers("(00:15) Welcome back")).toBe("Welcome back");
      expect(stripTimestampMarkers("00:00:05 - Good morning")).toBe("Good morning");
    });

    it("preserves dialogue numbers and dates safely", () => {
      expect(stripTimestampMarkers("[01:23] In 2026, we have 42 items")).toBe("In 2026, we have 42 items");
      expect(stripTimestampMarkers("Call me at 3:00 PM, I have 5 items")).toBe("Call me at 3:00 PM, I have 5 items");
    });

    it("preserves Hindi Devanagari text and special tags like [संगीत]", () => {
      expect(stripTimestampMarkers("[संगीत] नमस्ते दुनिया")).toBe("[संगीत] नमस्ते दुनिया");
    });
  });

  describe("formatTranscriptIntoParagraphs and serializeTranscript", () => {
    const sampleSegments = [
      { text: "रिश्ता वही खूबसूरत होता है", start: 0, duration: 2, timestamp: "00:00" },
      { text: "जहां नाराजगी हो सकती है मगर दिल में दूरी नहीं होती।", start: 2, duration: 3, timestamp: "00:02" },
      { text: "कहा जाता है कि पति-पत्नी का रिश्ता बहुत अनमोल होता है", start: 5, duration: 3, timestamp: "00:05" },
      { text: "लेकिन कुछ बातें इस रिश्ते को कमजोर कर देती हैं।", start: 8, duration: 3, timestamp: "00:08" },
    ];

    it("formats segments into readable paragraphs without timestamps", () => {
      const paragraphs = formatTranscriptIntoParagraphs(sampleSegments);
      expect(paragraphs.length).toBeGreaterThan(0);
      expect(paragraphs[0]).toContain("रिश्ता वही खूबसूरत होता है");
      expect(paragraphs[0]).not.toContain("00:00");
    });

    it("serializeTranscript with includeTimestamps: false produces clean text", () => {
      const serialized = serializeTranscript(sampleSegments, false);
      expect(serialized).not.toContain("[00:00]");
      expect(serialized).toContain("रिश्ता वही खूबसूरत होता है");
    });

    it("serializeTranscript with includeTimestamps: true produces timestamped lines", () => {
      const serialized = serializeTranscript(sampleSegments, true);
      expect(serialized).toContain("[00:00] रिश्ता वही खूबसूरत होता है");
      expect(serialized).toContain("[00:02]");
    });
  });

  describe("chunkText", () => {
    it("does not split text shorter than limit", () => {
      const text = "A short paragraph of text";
      const chunks = chunkText(text, 100);
      expect(chunks).toEqual([text]);
    });

    it("splits long text preserving words", () => {
      const text = "word ".repeat(50).trim();
      const chunks = chunkText(text, 50);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.join(" ")).toBe(text);
    });
  });

  describe("selectBestCaptionTrack - Priority 1 & 6 Regression Tests", () => {
    const mockRefTracks: DiscoveredCaptionTrack[] = [
      {
        languageCode: "en-US",
        name: "English (United States) (auto-generated)",
        vssId: "a.en-US",
        kind: "asr",
        isAutomatic: true,
        isTranslatable: true,
        baseUrl: "https://www.youtube.com/api/timedtext?v=BpqEl8VMRXU&lang=en-US",
      },
      {
        languageCode: "hi",
        name: "Hindi (auto-generated)",
        vssId: "a.hi",
        kind: "asr",
        isAutomatic: true,
        isTranslatable: true,
        baseUrl: "https://www.youtube.com/api/timedtext?v=BpqEl8VMRXU&lang=hi",
      },
    ];

    it("prefers native Hindi ASR track over English auto-generated track for reference video tracks in Auto-detect", () => {
      const selected = selectBestCaptionTrack(mockRefTracks, {
        videoTitle: "🔥 पति-पत्नी के बीच ये 3 बातें कभी मत आने देना! 😢🙏",
      });
      expect(selected).not.toBeNull();
      expect(selected?.languageCode).toBe("hi");
      expect(selected?.vssId).toBe("a.hi");
    });

    it("prefers Hindi original caption track even if English translated track is listed first", () => {
      const selected = selectBestCaptionTrack(mockRefTracks);
      expect(selected?.languageCode).toBe("hi");
    });

    it("keeps English track for an English video with only English captions in Auto-detect", () => {
      const englishTracks: DiscoveredCaptionTrack[] = [
        {
          languageCode: "en",
          name: "English (auto-generated)",
          vssId: "a.en",
          kind: "asr",
          isAutomatic: true,
          isTranslatable: true,
          baseUrl: "https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en",
        },
      ];
      const selected = selectBestCaptionTrack(englishTracks, {
        videoTitle: "Rick Astley - Never Gonna Give You Up",
      });
      expect(selected?.languageCode).toBe("en");
    });

    it("prefers creator-provided manual Hindi caption when available", () => {
      const mixedTracks: DiscoveredCaptionTrack[] = [
        {
          languageCode: "en",
          name: "English",
          vssId: "en",
          isAutomatic: false,
          isTranslatable: true,
          baseUrl: "https://www.youtube.com/api/timedtext?v=test&lang=en",
        },
        {
          languageCode: "hi",
          name: "Hindi (हिंदी)",
          vssId: "hi",
          isAutomatic: false,
          isTranslatable: true,
          baseUrl: "https://www.youtube.com/api/timedtext?v=test&lang=hi",
        },
      ];
      const selected = selectBestCaptionTrack(mixedTracks, {
        videoTitle: "हिंदी व्याख्यान और चर्चा",
      });
      expect(selected?.languageCode).toBe("hi");
      expect(selected?.isAutomatic).toBe(false);
    });

    it("respects explicit language request over auto-detection", () => {
      const selected = selectBestCaptionTrack(mockRefTracks, {
        preferredLang: "en-US",
      });
      expect(selected?.languageCode).toBe("en-US");
    });
  });

  describe("detectLanguageFromContent - Multi-tier Validation & Edge Cases", () => {
    it("detects Hindi with high confidence from Devanagari script", () => {
      const result = detectLanguageFromContent("रिश्ता वही खूबसूरत होता है जहां नाराजगी हो सकती है");
      expect(result.code).toBe("hi");
      expect(result.isConfident).toBe(true);
      expect(result.method).toBe("devanagari_unicode_analysis");
    });

    it("identifies English from Latin stop words with content heuristic", () => {
      const result = detectLanguageFromContent("Hello and welcome back to this episode about web engineering");
      expect(result.code).toBe("en");
      expect(result.isConfident).toBe(true);
      expect(result.method).toBe("content_heuristic");
    });

    it("identifies Romanized Hindi (Hinglish) without forcing English", () => {
      const result = detectLanguageFromContent("aaj hum baat karenge bohot important baatein jo aapko pata honi chahiye");
      expect(result.code).toBe("hi");
      expect(result.isConfident).toBe(true);
      expect(result.method).toBe("latin_hinglish_analysis");
    });

    it("reports uncertain / und for ambiguous text without fabricating English", () => {
      const result = detectLanguageFromContent("12345 67890 qwerty asdfgh");
      expect(result.code).toBe("und");
      expect(result.isConfident).toBe(false);
      expect(result.method).toBe("undetermined");
    });
  });

  describe("TranscriptCache - Cache isolation & invalidation", () => {
    it("isolates cache keys by video ID, track language, and output language", () => {
      const cache = new TranscriptCache();
      const key1 = cache.makeKey({ videoId: "BpqEl8VMRXU", captionTrackLanguage: "hi", outputLanguage: "original" });
      const key2 = cache.makeKey({ videoId: "BpqEl8VMRXU", captionTrackLanguage: "en-US", outputLanguage: "original" });
      const key3 = cache.makeKey({ videoId: "BpqEl8VMRXU", captionTrackLanguage: "hi", outputLanguage: "en" });

      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it("invalidates cached transcript if fullText has Devanagari but sourceLanguage was marked en", () => {
      const cache = new TranscriptCache();
      const mockPayload = {
        videoId: "BpqEl8VMRXU",
        sourceLanguage: "en",
        outputLanguage: "en",
        fullText: "नमस्ते दुनिया यह एक परीक्षण है",
        segments: [{ text: "नमस्ते दुनिया", start: 0, duration: 2, timestamp: "00:00" }],
      } as unknown as TranscriptPayload;

      expect(cache.isValid(mockPayload)).toBe(false);
    });

    it("invalidates cached transcript if a translated transcript is requested for original language", () => {
      const cache = new TranscriptCache();
      const mockPayload = {
        videoId: "BpqEl8VMRXU",
        sourceLanguage: "hi",
        outputLanguage: "en",
        isTranslated: true,
        fullText: "Hello world",
        segments: [{ text: "Hello world", start: 0, duration: 2, timestamp: "00:00" }],
      } as unknown as TranscriptPayload;

      expect(cache.isValid(mockPayload, "original")).toBe(false);
    });
  });

  describe("Speech-to-Text Integration Fallback", () => {
    it("uses configured Speech-to-Text provider with automatic language detection when captions are unavailable", async () => {
      const mockProvider: SpeechToTextProvider = {
        isConfigured: () => true,
        transcribeAudio: async () => {
          return createMockSttResult(
            "पति पत्नी के बीच विश्वास सबसे महत्वपूर्ण कड़ी है",
            "hi",
            "Hindi (हिंदी)",
          );
        },
      };

      registerSpeechToTextProvider(mockProvider);

      const sttResult = await transcribeWithSpeechToText({ videoId: "mock-video-no-captions" });
      expect(sttResult.detectedLanguage).toBe("hi");
      expect(sttResult.detectedLanguageName).toContain("Hindi");
      expect(sttResult.text).toContain("पति पत्नी");
      expect(sttResult.segments.length).toBeGreaterThan(0);

      // Clean up provider hook
      registerSpeechToTextProvider(null);
    });
  });
});
