// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TranscriptClient } from "@/components/pages/transcript-client";
import { resetWorkspace } from "@/hooks/use-workspace";

const mockTranscriptEnvelope = {
  ok: true,
  data: {
    videoId: "dQw4w9WgXcQ",
    videoMetadata: {
      id: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Rick Astley - Never Gonna Give You Up",
      channelTitle: "Rick Astley",
      channelUrl: "https://www.youtube.com/@RickAstley",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      durationSeconds: 212,
      durationFormatted: "3:32",
      publishedAt: null,
      viewCount: null,
      description: null,
      tags: ["rick astley", "never gonna give you up", "pop", "80s music"],
      hashtags: ["#rickastley", "#80smusic", "#pop"],
    },
    tags: ["rick astley", "never gonna give you up", "pop", "80s music"],
    hashtags: ["#rickastley", "#80smusic", "#pop"],
    sourceLanguage: "en",
    sourceLanguageName: "English",
    outputLanguage: "en",
    outputLanguageName: "English",
    isTranslated: false,
    isAutomatic: true,
    isHumanCreated: false,
    availableLanguages: ["en"],
    segments: [
      { text: "We're no strangers to love", start: 18.5, duration: 4.2, timestamp: "00:18" },
      { text: "You know the rules and so do I", start: 22.8, duration: 3.5, timestamp: "00:22" },
    ],
    originalSegments: [
      { text: "We're no strangers to love", start: 18.5, duration: 4.2, timestamp: "00:18" },
      { text: "You know the rules and so do I", start: 22.8, duration: 3.5, timestamp: "00:22" },
    ],
    fullText: "We're no strangers to love You know the rules and so do I",
    charCount: 57,
    wordCount: 13,
    accuracyDisclosure: "Retrieved directly from YouTube caption tracks.",
  },
  meta: {
    source: "YouTube Caption Tracks",
    retrievedAt: "2026-10-29T12:00:00.000Z",
    cached: false,
    cacheAgeSeconds: null,
    sampleSize: 2,
    region: null,
    language: "en",
    warnings: [],
  },
  error: null,
};

const mockTranslationEnvelope = {
  ok: true,
  data: {
    targetLanguage: "hi",
    targetLanguageName: "Hindi (हिंदी)",
    sourceLanguage: "en",
    segments: [
      { text: "हम प्यार से अनजान नहीं हैं", start: 18.5, duration: 4.2, timestamp: "00:18" },
      { text: "आप नियम जानते हैं और मैं भी जानता हूं", start: 22.8, duration: 3.5, timestamp: "00:22" },
    ],
    fullText: "हम प्यार से अनजान नहीं हैं आप नियम जानते हैं और मैं भी जानता हूं",
    service: "Google Neural Machine Translation",
  },
  meta: {
    source: "Google Neural Machine Translation",
    retrievedAt: "2026-10-29T12:00:00.000Z",
    cached: false,
    cacheAgeSeconds: null,
    sampleSize: 2,
    region: null,
    language: "hi",
    warnings: [],
  },
  error: null,
};

const mockSummaryEnvelope = {
  ok: true,
  data: {
    videoId: "dQw4w9WgXcQ",
    overview: "A timeless 80s anthem about devotion and loyalty.",
    keyTakeaways: [
      "Commitment to never giving up or letting down",
      "Sincerity in emotional connection",
    ],
    sections: [
      {
        title: "Chorus Promise",
        points: ["Never gonna give you up", "Never gonna let you down"],
      },
    ],
    language: "en",
    modelUsed: "openai (gpt-4o-mini)",
    summaryType: "concise",
    generatedAt: "2026-10-29T12:01:00.000Z",
  },
  meta: {
    source: "AI Engine",
    retrievedAt: "2026-10-29T12:01:00.000Z",
    cached: false,
    cacheAgeSeconds: null,
    sampleSize: null,
    region: null,
    language: "en",
    warnings: [],
  },
  error: null,
};

describe("Transcript UI client flow", () => {
  beforeEach(() => {
    localStorage.clear();
    resetWorkspace();
    window.history.replaceState({}, "", "/transcript");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/youtube/translate")) {
          return Promise.resolve(
            new Response(JSON.stringify(mockTranslationEnvelope), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          );
        }
        if (url.includes("/api/youtube/summary")) {
          return Promise.resolve(
            new Response(JSON.stringify(mockSummaryEnvelope), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify(mockTranscriptEnvelope), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("submits video URL and displays clean transcript without timestamps by default", async () => {
    const user = userEvent.setup();
    render(<TranscriptClient />);

    const input = screen.getByLabelText("YouTube video URL or ID");
    await user.type(input, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    const submitBtn = screen.getByRole("button", { name: "Get Transcript" });
    await user.click(submitBtn);

    expect(await screen.findByText("Rick Astley - Never Gonna Give You Up")).toBeInTheDocument();
    expect(screen.getByText(/We're no strangers to love/)).toBeInTheDocument();

    // Timestamp must be OFF by default
    expect(screen.queryByText("00:18")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Timestamp OFF/i })).toBeInTheDocument();
  });

  it("toggles timestamps on and off", async () => {
    const user = userEvent.setup();
    render(<TranscriptClient />);

    const input = screen.getByLabelText("YouTube video URL or ID");
    await user.type(input, "dQw4w9WgXcQ");
    await user.click(screen.getByRole("button", { name: "Get Transcript" }));

    await screen.findByText("Rick Astley - Never Gonna Give You Up");

    // Click toggle to turn ON
    const toggleBtn = screen.getByRole("button", { name: /Timestamp OFF/i });
    await user.click(toggleBtn);

    expect(await screen.findByText("00:18")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Timestamp ON/i })).toBeInTheDocument();

    // Click toggle to turn back OFF
    await user.click(screen.getByRole("button", { name: /Timestamp ON/i }));
    expect(screen.queryByText("00:18")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Timestamp OFF/i })).toBeInTheDocument();
  });

  it("translates transcript to Hindi when Hindi is selected", async () => {
    const user = userEvent.setup();
    render(<TranscriptClient />);

    const input = screen.getByLabelText("YouTube video URL or ID");
    await user.type(input, "dQw4w9WgXcQ");
    await user.click(screen.getByRole("button", { name: "Get Transcript" }));

    await screen.findByText("Rick Astley - Never Gonna Give You Up");

    const langSelect = screen.getByLabelText("Select transcript output language");
    await user.selectOptions(langSelect, "hi");

    expect(await screen.findByText(/हम प्यार से अनजान नहीं हैं/)).toBeInTheDocument();
    expect(screen.getByText(/Translated/)).toBeInTheDocument();
    expect(screen.getByText(/Reset to Original/)).toBeInTheDocument();
  });

  it("switches to AI Summary tab and displays summary", async () => {
    const user = userEvent.setup();
    render(<TranscriptClient />);

    const input = screen.getByLabelText("YouTube video URL or ID");
    await user.type(input, "dQw4w9WgXcQ");
    await user.click(screen.getByRole("button", { name: "Get Transcript" }));

    await screen.findByText("Rick Astley - Never Gonna Give You Up");

    const summaryTab = screen.getByRole("tab", { name: /AI Summaries/i });
    await user.click(summaryTab);

    expect(
      await screen.findByText("A timeless 80s anthem about devotion and loyalty."),
    ).toBeInTheDocument();
    expect(screen.getByText("Commitment to never giving up or letting down")).toBeInTheDocument();
    expect(screen.getByText("Chorus Promise")).toBeInTheDocument();
  });

  it("renders native Hindi video transcript in Auto-detect mode with correct indicator and Devanagari text", async () => {
    const hindiTranscriptEnvelope = {
      ok: true,
      data: {
        videoId: "BpqEl8VMRXU",
        videoMetadata: {
          id: "BpqEl8VMRXU",
          url: "https://www.youtube.com/watch?v=BpqEl8VMRXU",
          title: "पति-पत्नी के बीच ये 3 बातें कभी मत आने देना!",
          channelTitle: "Inspirational Quotes",
          channelUrl: "https://www.youtube.com/@quotes",
          thumbnailUrl: "https://i.ytimg.com/vi/BpqEl8VMRXU/hqdefault.jpg",
          durationSeconds: 180,
          durationFormatted: "3:00",
          publishedAt: null,
          viewCount: null,
          description: null,
        },
        sourceLanguage: "hi",
        sourceLanguageName: "Hindi (हिंदी)",
        outputLanguage: "hi",
        outputLanguageName: "Hindi (हिंदी)",
        isTranslated: false,
        isAutomatic: true,
        isHumanCreated: false,
        availableLanguages: ["hi", "en-US"],
        segments: [
          { text: "रिश्ता वही खूबसूरत होता है जहां नाराजगी हो सकती है", start: 0.8, duration: 4.2, timestamp: "00:00" },
        ],
        originalSegments: [
          { text: "रिश्ता वही खूबसूरत होता है जहां नाराजगी हो सकती है", start: 0.8, duration: 4.2, timestamp: "00:00" },
        ],
        fullText: "रिश्ता वही खूबसूरत होता है जहां नाराजगी हो सकती है",
        charCount: 52,
        wordCount: 10,
        accuracyDisclosure: "Retrieved directly from YouTube automatic caption tracks.",
        selectedTranscriptLanguage: "original",
        actualTranscriptLanguage: "hi",
        captionTrackLanguage: "hi",
        languageDetectionMethod: "devanagari_unicode_analysis",
        translationStatus: "not_needed",
        isLanguageUncertain: false,
        availableCaptionTracks: [
          { languageCode: "en-US", name: "English (United States)", isAutomatic: true },
          { languageCode: "hi", name: "Hindi (auto-generated)", isAutomatic: true },
        ],
      },
      meta: {
        source: "YouTube Caption Tracks",
        retrievedAt: "2026-10-29T12:00:00.000Z",
        cached: false,
        cacheAgeSeconds: null,
        sampleSize: 1,
        region: null,
        language: "hi",
        warnings: [],
      },
      error: null,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(hindiTranscriptEnvelope), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const user = userEvent.setup();
    render(<TranscriptClient />);

    const input = screen.getByLabelText("YouTube video URL or ID");
    await user.type(input, "https://youtu.be/BpqEl8VMRXU");
    await user.click(screen.getByRole("button", { name: "Get Transcript" }));

    expect(await screen.findByText("पति-पत्नी के बीच ये 3 बातें कभी मत आने देना!")).toBeInTheDocument();
    expect(screen.getByText(/रिश्ता वही खूबसूरत होता है/)).toBeInTheDocument();
    expect(screen.getAllByText(/Hindi \(हिंदी\)/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Copy Transcript/i })).toBeInTheDocument();
  });

  it("clears inputs and results when Clear button is clicked", async () => {
    const user = userEvent.setup();
    render(<TranscriptClient />);

    const input = screen.getByLabelText("YouTube video URL or ID");
    await user.type(input, "dQw4w9WgXcQ");
    await user.click(screen.getByRole("button", { name: "Get Transcript" }));

    expect(await screen.findByText("Rick Astley - Never Gonna Give You Up")).toBeInTheDocument();

    const clearBtn = screen.getByRole("button", { name: "Clear input and results" });
    await user.click(clearBtn);

    expect(screen.queryByText("Rick Astley - Never Gonna Give You Up")).not.toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("displays used keywords and hashtags with full copy options", async () => {
    const user = userEvent.setup();
    render(<TranscriptClient />);

    const input = screen.getByLabelText("YouTube video URL or ID");
    await user.type(input, "dQw4w9WgXcQ");
    await user.click(screen.getByRole("button", { name: "Get Transcript" }));

    expect(await screen.findByText("Rick Astley - Never Gonna Give You Up")).toBeInTheDocument();

    // Verify sidebar quick stats card shows keywords and hashtags counts
    expect(screen.getAllByText("Keywords & Hashtags").length).toBeGreaterThan(0);
    expect(screen.getByText("Keywords")).toBeInTheDocument();
    expect(screen.getByText("Hashtags")).toBeInTheDocument();

    // Switch to Keywords & Hashtags tab
    const tagsTab = screen.getByRole("tab", { name: /Keywords & Hashtags/i });
    expect(tagsTab).toBeInTheDocument();
    await user.click(tagsTab);

    // Verify Tab Panel contents
    expect(screen.getByText("Used Keywords / Tags")).toBeInTheDocument();
    expect(screen.getByText("Used Hashtags")).toBeInTheDocument();

    // Verify keywords chips are rendered in both sidebar preview and tab panel
    expect(screen.getAllByText("rick astley").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("never gonna give you up").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("80s music").length).toBeGreaterThanOrEqual(1);

    // Verify hashtags chips are rendered
    expect(screen.getAllByText("#rickastley").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("#80smusic").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("#pop").length).toBeGreaterThanOrEqual(1);

    // Verify copy buttons are rendered
    expect(screen.getByRole("button", { name: /Copy Keywords \(4\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy Hashtags \(3\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Copy All$/i })).toBeInTheDocument();

    // Click Copy Keywords button
    await user.click(screen.getByRole("button", { name: /Copy Keywords \(4\)/i }));
    expect(await screen.findByText(/Copied 4 keywords to clipboard!/i)).toBeInTheDocument();

    // Click Copy Hashtags button
    await user.click(screen.getByRole("button", { name: /Copy Hashtags \(3\)/i }));
    expect(await screen.findByText(/Copied 3 hashtags to clipboard!/i)).toBeInTheDocument();
  });
});
