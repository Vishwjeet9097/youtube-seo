"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Languages,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import { Badge, Button, Callout, EmptyState, LoadingState, PageHeader, Panel } from "@/components/shared/ui";
import { Input, Select } from "@/components/shared/form-fields";
import { copyText } from "@/lib/browser-export";
import { postApi } from "@/lib/client-api";
import { extractVideoId } from "@/lib/services/metadata";
import {
  formatTranscriptIntoParagraphs,
  serializeTranscript,
  stripTimestampMarkers,
} from "@/lib/services/transcript";
import type {
  SummaryPayload,
  TranscriptPayload,
  TranscriptSegmentItem,
  TranslationPayload,
  VideoMetadataDetails,
} from "@/types/research";

const LANGUAGE_OPTIONS: Array<[string, string]> = [
  ["original", "Original language / Auto-detect"],
  ["hi", "Hindi (हिंदी)"],
  ["en", "English"],
  ["es", "Spanish (Español)"],
  ["fr", "French (Français)"],
  ["de", "German (Deutsch)"],
  ["pt", "Portuguese (Português)"],
  ["it", "Italian (Italiano)"],
  ["ja", "Japanese (日本語)"],
  ["ko", "Korean (한국어)"],
  ["zh", "Chinese (中文)"],
  ["ar", "Arabic (العربية)"],
  ["ru", "Russian (Русский)"],
  ["bn", "Bengali (বাংলা)"],
  ["ur", "Urdu (اردो)"],
  ["id", "Indonesian"],
  ["tr", "Turkish (Türkçe)"],
];

export function TranscriptClient() {
  const [urlInput, setUrlInput] = useState("");
  const [activeTab, setActiveTab] = useState<"transcript" | "summary">("transcript");

  // Default timestamp setting must be OFF for clean transcript experience
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  // Three distinct language concepts
  const [selectedOutputLanguage, setSelectedOutputLanguage] = useState<string>("original");
  const [selectedTrackLanguage, setSelectedTrackLanguage] = useState<string>("auto");
  const [summaryLanguage, setSummaryLanguage] = useState<string>("original");

  // States
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingTranslation, setLoadingTranslation] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Data
  const [transcriptData, setTranscriptData] = useState<TranscriptPayload | null>(null);
  const [translatedData, setTranslatedData] = useState<TranslationPayload | null>(null);
  const [summaryData, setSummaryData] = useState<SummaryPayload | null>(null);
  const [summaryType, setSummaryType] = useState<"concise" | "detailed">("concise");

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const tabListId = useId();
  const requestSeqRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup pending requests on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Read URL query params on load
  useEffect(() => {
    const query =
      new URLSearchParams(window.location.search).get("url") ??
      new URLSearchParams(window.location.search).get("v") ??
      new URLSearchParams(window.location.search).get("input");
    if (query) {
      setUrlInput(query);
    }
  }, []);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2500);
  };

  // Determine current active segments
  const currentSegments: TranscriptSegmentItem[] = useMemo(() => {
    if (selectedOutputLanguage === "original") {
      return transcriptData?.originalSegments ?? transcriptData?.segments ?? [];
    }
    if (translatedData && translatedData.segments.length > 0) {
      return translatedData.segments;
    }
    return transcriptData?.segments ?? [];
  }, [transcriptData, translatedData, selectedOutputLanguage]);

  // Clean paragraphs for display when timestamps are OFF
  const cleanParagraphs = useMemo(() => {
    return formatTranscriptIntoParagraphs(currentSegments);
  }, [currentSegments]);

  // Filtered segments when searching
  const filteredSegments = useMemo(() => {
    if (!searchFilter.trim()) return currentSegments;
    const q = searchFilter.toLowerCase();
    return currentSegments.filter((s) => s.text.toLowerCase().includes(q));
  }, [currentSegments, searchFilter]);

  // Filtered paragraphs when searching
  const filteredParagraphs = useMemo(() => {
    if (!searchFilter.trim()) return cleanParagraphs;
    const q = searchFilter.toLowerCase();
    return cleanParagraphs.filter((p) => p.toLowerCase().includes(q));
  }, [cleanParagraphs, searchFilter]);

  // Video seeking in embed
  const seekVideo = useCallback((seconds: number) => {
    if (!iframeRef.current) return;
    try {
      iframeRef.current.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }),
        "*",
      );
      iframeRef.current.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "playVideo", args: [] }),
        "*",
      );
    } catch {
      // Seek message dispatched
    }
  }, []);

  // Fetch Transcript handler
  const handleFetchTranscript = async () => {
    const raw = urlInput.trim();
    if (!raw) {
      setError("Please paste a valid YouTube video URL or 11-character video ID.");
      return;
    }

    try {
      extractVideoId(raw);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid YouTube link.");
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const currentSeq = ++requestSeqRef.current;
    setLoadingTranscript(true);
    setError(null);
    setTranslationError(null);
    setTranslatedData(null);
    setSummaryData(null);
    setStage("Retrieving video details and captions…");

    try {
      const response = await postApi<TranscriptPayload>(
        "/api/youtube/transcript",
        {
          input: raw,
          trackLanguage: selectedTrackLanguage !== "auto" ? selectedTrackLanguage : undefined,
          outputLanguage: selectedOutputLanguage !== "original" ? selectedOutputLanguage : undefined,
        },
        controller.signal,
      );

      if (currentSeq !== requestSeqRef.current) return;

      const data = response.data;
      setTranscriptData(data);

      if (data.isTranslated) {
        setTranslatedData({
          targetLanguage: data.outputLanguage,
          targetLanguageName: data.outputLanguageName,
          sourceLanguage: data.sourceLanguage,
          segments: data.segments,
          fullText: data.fullText,
          service: "Google Neural Machine Translation",
        });
      }

      setStage("Transcript ready");
      flash(
        data.isTranslated
          ? `Transcript loaded in ${data.outputLanguageName}!`
          : "Clean transcript loaded successfully!",
      );
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      if (currentSeq !== requestSeqRef.current) return;
      setError(caught instanceof Error ? caught.message : "Could not retrieve transcript.");
      setTranscriptData(null);
    } finally {
      if (currentSeq === requestSeqRef.current) {
        setLoadingTranscript(false);
      }
    }
  };

  // Translation handler for changing language
  const handleLanguageChange = async (targetLang: string) => {
    setSelectedOutputLanguage(targetLang);
    setTranslationError(null);

    if (!transcriptData) return;

    // If user selected original language, return to source transcript immediately
    if (targetLang === "original") {
      abortControllerRef.current?.abort();
      setTranslatedData(null);
      flash("Switched to original transcript.");
      return;
    }

    const sourceLang = transcriptData.sourceLanguage;

    // If target language matches source language, use original segments without translating
    if (targetLang.toLowerCase().slice(0, 2) === sourceLang.toLowerCase().slice(0, 2)) {
      abortControllerRef.current?.abort();
      setTranslatedData(null);
      flash(`Displaying original ${transcriptData.sourceLanguageName} transcript.`);
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Otherwise invoke real translation
    const currentSeq = ++requestSeqRef.current;
    setLoadingTranslation(true);

    try {
      const response = await postApi<TranslationPayload>(
        "/api/youtube/translate",
        {
          segments: transcriptData.originalSegments ?? transcriptData.segments,
          targetLanguage: targetLang,
          sourceLanguage: sourceLang,
        },
        controller.signal,
      );

      if (currentSeq !== requestSeqRef.current) return;

      setTranslatedData(response.data);
      flash(`Transcript translated to ${response.data.targetLanguageName}!`);
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      if (currentSeq !== requestSeqRef.current) return;
      setTranslationError(
        caught instanceof Error ? caught.message : `Failed to translate transcript to ${targetLang}.`,
      );
    } finally {
      if (currentSeq === requestSeqRef.current) {
        setLoadingTranslation(false);
      }
    }
  };

  // Generate Summary handler
  const handleGenerateSummary = async (overrideType?: "concise" | "detailed") => {
    if (!transcriptData) return;
    const type = overrideType ?? summaryType;
    setLoadingSummary(true);
    setError(null);

    // Use current transcript language or user's requested summary language
    const currentText = translatedData?.fullText ?? transcriptData.fullText;
    const langToUse =
      summaryLanguage === "original"
        ? transcriptData.sourceLanguage
        : summaryLanguage || transcriptData.sourceLanguage;

    try {
      const response = await postApi<SummaryPayload>("/api/youtube/summary", {
        videoId: transcriptData.videoId,
        transcript: currentText,
        summaryType: type,
        language: langToUse,
      });

      setSummaryData(response.data);
      flash("AI Summary generated successfully!");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate summary.");
    } finally {
      setLoadingSummary(false);
    }
  };

  // Paste from clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput(text.trim());
        flash("Pasted from clipboard!");
      }
    } catch {
      setError("Clipboard access was denied by your browser. Please paste manually into the input box.");
    }
  };

  // Track selection change handler
  const handleTrackChange = async (trackCode: string) => {
    setSelectedTrackLanguage(trackCode);
    const raw = urlInput.trim();
    if (!raw) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const currentSeq = ++requestSeqRef.current;
    setLoadingTranscript(true);
    setError(null);
    setTranslationError(null);
    setTranslatedData(null);
    setStage("Switching caption track…");

    try {
      const response = await postApi<TranscriptPayload>(
        "/api/youtube/transcript",
        {
          input: raw,
          trackLanguage: trackCode !== "auto" ? trackCode : undefined,
          outputLanguage: selectedOutputLanguage !== "original" ? selectedOutputLanguage : undefined,
        },
        controller.signal,
      );

      if (currentSeq !== requestSeqRef.current) return;
      const data = response.data;
      setTranscriptData(data);
      if (data.isTranslated) {
        setTranslatedData({
          targetLanguage: data.outputLanguage,
          targetLanguageName: data.outputLanguageName,
          sourceLanguage: data.sourceLanguage,
          segments: data.segments,
          fullText: data.fullText,
          service: "Google Neural Machine Translation",
        });
      }
      flash(`Loaded ${data.captionTrackLanguage ?? trackCode} caption track!`);
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      if (currentSeq !== requestSeqRef.current) return;
      setError(caught instanceof Error ? caught.message : "Could not retrieve selected caption track.");
    } finally {
      if (currentSeq === requestSeqRef.current) {
        setLoadingTranscript(false);
      }
    }
  };

  // Clear all results and input
  const handleClear = () => {
    abortControllerRef.current?.abort();
    requestSeqRef.current++;
    setUrlInput("");
    setTranscriptData(null);
    setTranslatedData(null);
    setSummaryData(null);
    setError(null);
    setTranslationError(null);
    setSearchFilter("");
    setSelectedOutputLanguage("original");
    setSelectedTrackLanguage("auto");
    setLoadingTranscript(false);
    setLoadingTranslation(false);
    setLoadingSummary(false);
  };

  // Copy transcript with or without timestamps based on current toggle
  const handleCopyTranscript = async () => {
    if (!currentSegments.length) return;

    const serialized = serializeTranscript(currentSegments, showTimestamps);

    try {
      await copyText(serialized);
      flash(
        showTimestamps
          ? "Copied transcript with timestamps to clipboard!"
          : "Copied clean transcript (without timestamps) to clipboard!",
      );
    } catch {
      setError("Unable to copy to clipboard. Please copy manually.");
    }
  };

  // Copy AI summary
  const handleCopySummary = async () => {
    if (!summaryData) return;
    const lines = [
      `AI SUMMARY (${summaryData.summaryType.toUpperCase()})`,
      "========================================",
      "",
      summaryData.overview,
      "",
      "KEY TAKEAWAYS:",
      ...summaryData.keyTakeaways.map((t) => `• ${t}`),
      "",
      ...summaryData.sections.flatMap((s) => [
        `\n## ${s.title}`,
        ...s.points.map((p) => `• ${p}`),
      ]),
    ];

    try {
      await copyText(lines.join("\n"));
      flash("Copied AI summary to clipboard!");
    } catch {
      setError("Unable to copy to clipboard. Please copy manually.");
    }
  };

  const metadata: VideoMetadataDetails | null = transcriptData?.videoMetadata ?? null;

  const isCurrentlyTranslated =
    selectedOutputLanguage !== "original" &&
    Boolean(translatedData) &&
    transcriptData?.sourceLanguage.toLowerCase().slice(0, 2) !==
      selectedOutputLanguage.toLowerCase().slice(0, 2);

  const displayLanguageName = isCurrentlyTranslated
    ? translatedData?.targetLanguageName ?? "Translated"
    : transcriptData?.sourceLanguageName ?? "Original";

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="Research Tools"
        title="YouTube Transcript & AI Summary"
        description="Extract clean spoken transcripts with optional synchronized timestamps, generate token-aware AI summaries, and translate into Hindi and other languages."
      />

      {notice ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl border border-brand/30 bg-surface-raised/95 px-4 py-3 text-sm font-semibold text-foreground shadow-[var(--shadow-lg)] backdrop-blur-md"
        >
          <CheckCircle2 className="size-4 text-brand-strong" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}

      {/* Input Panel with perfectly aligned horizontal controls */}
      <Panel className="mb-6 p-4 sm:p-6 min-w-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleFetchTranscript();
          }}
          className="space-y-2 min-w-0"
        >
          <label htmlFor="youtube-url-input" className="field-label block font-semibold">
            YouTube Video Link or Video ID
          </label>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center min-w-0">
            <div className="relative min-w-0 flex-1">
              <Input
                id="youtube-url-input"
                type="text"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="https://www.youtube.com/watch?v=... or shorts/..."
                disabled={loadingTranscript}
                aria-label="YouTube video URL or ID"
                aria-describedby="youtube-url-hint"
                className="!h-11 w-full !text-sm"
              />
            </div>

            <div className="flex flex-wrap sm:flex-nowrap shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handlePaste}
                disabled={loadingTranscript}
                title="Paste from clipboard"
                className="!h-11 !px-4 text-xs font-semibold"
              >
                Paste
              </Button>

              {urlInput ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClear}
                  disabled={loadingTranscript}
                  title="Clear input and results"
                  aria-label="Clear input and results"
                  className="!size-11 !p-0 grid place-items-center"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                disabled={loadingTranscript || !urlInput.trim()}
                className="!h-11 !px-5 font-semibold"
              >
                {loadingTranscript ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Extracting…</span>
                  </>
                ) : (
                  <>
                    <FileText className="size-4" aria-hidden="true" />
                    <span>Get Transcript</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          <p id="youtube-url-hint" className="field-help text-xs text-muted">
            Supports standard watch URLs, youtu.be, shorts, embeds, and raw 11-character video IDs
          </p>
        </form>

        {error ? (
          <div className="mt-4">
            <Callout tone="danger" title="Operation notice">
              <p>{error}</p>
              {error.includes("AI summarization service is not configured") ? (
                <div className="mt-2 text-xs">
                  <p className="font-semibold">Setup instructions:</p>
                  <p>
                    Add one of the following to your local environment file (<code>.env.local</code>):
                  </p>
                  <pre className="mt-1.5 rounded-lg bg-surface-muted p-2 font-mono text-[11px] text-foreground">
                    OPENAI_API_KEY=your_openai_key_here
                    <br />
                    # or
                    <br />
                    GEMINI_API_KEY=your_gemini_key_here
                  </pre>
                </div>
              ) : null}
            </Callout>
          </div>
        ) : null}
      </Panel>

      {/* Main Results Workspace */}
      {loadingTranscript ? (
        <Panel className="p-12 min-w-0">
          <LoadingState label={stage || "Retrieving video and captions…"} />
        </Panel>
      ) : transcriptData ? (
        <div className="grid gap-6 lg:grid-cols-12 min-w-0">
          {/* Left Column: Video Preview and Metadata (5 columns) */}
          <div className="space-y-5 lg:col-span-5 min-w-0">
            {/* Embed Player */}
            <Panel className="overflow-hidden p-0 min-w-0">
              <div className="relative aspect-video w-full bg-black">
                <iframe
                  ref={iframeRef}
                  src={`https://www.youtube-nocookie.com/embed/${transcriptData.videoId}?enablejsapi=1&origin=${typeof window !== "undefined" ? window.location.origin : ""}`}
                  title={metadata?.title || "YouTube video"}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="size-full border-0"
                />
              </div>

              {metadata ? (
                <div className="p-4 sm:p-5 min-w-0">
                  <h2 className="text-base font-bold leading-snug text-foreground break-words">
                    {metadata.title}
                  </h2>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted min-w-0">
                    <span className="font-medium text-foreground">{metadata.channelTitle}</span>
                    {metadata.durationFormatted ? (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3.5" aria-hidden="true" />
                          {metadata.durationFormatted}
                        </span>
                      </>
                    ) : null}
                    <span>•</span>
                    {transcriptData.isLanguageUncertain ? (
                      <Badge tone="danger" className="text-[11px]">
                        Language could not be determined
                      </Badge>
                    ) : (
                      <Badge tone="brand" className="text-[11px]">
                        Detected language: {transcriptData.sourceLanguageName}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t pt-3.5 text-xs text-muted">
                    <span title={transcriptData.accuracyDisclosure}>
                      {transcriptData.isAutomatic ? "Automatic captions" : "Creator captions"}
                    </span>
                    <a
                      href={metadata.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 font-semibold text-brand hover:underline"
                    >
                      <span>Watch on YouTube</span>
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              ) : null}
            </Panel>

            {/* Quick Stats Card */}
            <Panel className="p-4 sm:p-5 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">
                Transcript Metrics
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border bg-surface-muted/60 p-2.5 min-w-0">
                  <p className="text-lg font-bold text-foreground tabular-nums">
                    {currentSegments.length}
                  </p>
                  <p className="text-[10px] text-muted">Segments</p>
                </div>
                <div className="rounded-xl border bg-surface-muted/60 p-2.5 min-w-0">
                  <p className="text-lg font-bold text-foreground tabular-nums">
                    {transcriptData.wordCount.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted">Words</p>
                </div>
                <div className="rounded-xl border bg-surface-muted/60 p-2.5 min-w-0">
                  <p className="text-lg font-bold text-foreground tabular-nums">
                    {transcriptData.charCount.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted">Characters</p>
                </div>
              </div>
            </Panel>
          </div>

          {/* Right Column: Interactive Tabs for Transcript & Summary (7 columns) */}
          <div className="lg:col-span-7 min-w-0">
            <Panel className="flex h-full min-h-[580px] flex-col overflow-hidden p-0 min-w-0">
              {/* Tab Navigation Pill Bar */}
              <div
                role="tablist"
                aria-label="Transcript and AI Summary options"
                className="flex items-center border-b bg-surface-muted/60 p-2 min-w-0"
              >
                <div className="flex w-full rounded-xl bg-surface-muted p-1 min-w-0">
                  <button
                    role="tab"
                    id={`${tabListId}-tab-transcript`}
                    aria-selected={activeTab === "transcript"}
                    aria-controls={`${tabListId}-panel-transcript`}
                    onClick={() => setActiveTab("transcript")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition min-w-0 ${
                      activeTab === "transcript"
                        ? "bg-foreground text-background shadow-xs dark:bg-brand dark:text-background"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    <FileText className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">Transcript</span>
                    {isCurrentlyTranslated ? (
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand-strong truncate max-w-[120px]">
                        {displayLanguageName}
                      </span>
                    ) : null}
                  </button>

                  <button
                    role="tab"
                    id={`${tabListId}-tab-summary`}
                    aria-selected={activeTab === "summary"}
                    aria-controls={`${tabListId}-panel-summary`}
                    onClick={() => {
                      setActiveTab("summary");
                      if (!summaryData && !loadingSummary) {
                        handleGenerateSummary();
                      }
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition min-w-0 ${
                      activeTab === "summary"
                        ? "bg-foreground text-background shadow-xs dark:bg-brand dark:text-background"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    <Sparkles className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">✦ AI Summaries</span>
                    {summaryData ? (
                      <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">
                        Ready
                      </span>
                    ) : null}
                  </button>
                </div>
              </div>

              {/* TAB 1: TRANSCRIPT (PRIMARY EXPERIENCE) */}
              {activeTab === "transcript" ? (
                <div
                  role="tabpanel"
                  id={`${tabListId}-panel-transcript`}
                  aria-labelledby={`${tabListId}-tab-transcript`}
                  className="flex flex-1 flex-col overflow-hidden min-w-0"
                >
                  {/* Action Bar with organized controls */}
                  <div className="space-y-3 border-b p-3.5 sm:p-4 min-w-0">
                    {/* Row 1: Copy, Timestamp Toggle, and Search Dialogue */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Prominent Copy Button */}
                        <Button
                          type="button"
                          variant="primary"
                          onClick={handleCopyTranscript}
                          title="Copy complete transcript to clipboard"
                          className="!h-10 !px-4 text-xs font-bold shrink-0"
                        >
                          <Copy className="size-4" aria-hidden="true" />
                          <span>Copy Transcript</span>
                        </Button>

                        {/* Timestamp Toggle (Default OFF) */}
                        <button
                          type="button"
                          onClick={() => {
                            const next = !showTimestamps;
                            setShowTimestamps(next);
                            flash(
                              next
                                ? "Timestamps enabled with clickable video seeking."
                                : "Clean transcript enabled without timestamps.",
                            );
                          }}
                          className={`flex !h-10 items-center justify-center gap-2 rounded-xl border px-3.5 text-xs font-semibold shrink-0 transition ${
                            showTimestamps
                              ? "border-brand/40 bg-brand-soft text-brand-strong"
                              : "border-border bg-surface-muted text-foreground hover:bg-surface-raised"
                          }`}
                          title="Toggle timestamps in view and copy output"
                          aria-pressed={showTimestamps}
                        >
                          <Clock className="size-4" aria-hidden="true" />
                          <span>Timestamp {showTimestamps ? "ON" : "OFF"}</span>
                        </button>
                      </div>

                      {/* Dialogue search input */}
                      <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
                        <Search
                          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted"
                          aria-hidden="true"
                        />
                        <Input
                          type="search"
                          value={searchFilter}
                          onChange={(e) => setSearchFilter(e.target.value)}
                          placeholder="Search dialogue…"
                          className="!h-10 !pl-8.5 !text-xs w-full"
                          aria-label="Search within transcript dialogue"
                        />
                      </div>
                    </div>

                    {/* Row 2: Transcript Language & Caption Track selectors */}
                    <div className="flex flex-wrap items-center gap-3 pt-0.5 min-w-0">
                      <div className="flex min-w-[200px] flex-1 items-center gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-muted shrink-0">
                          <Languages className="size-3.5" aria-hidden="true" />
                          <span>Transcript language:</span>
                        </span>

                        <Select
                          value={selectedOutputLanguage}
                          onChange={(e) => handleLanguageChange(e.target.value)}
                          disabled={loadingTranslation}
                          className="!h-9 !py-0 !text-xs flex-1 font-semibold"
                          aria-label="Select transcript output language"
                        >
                          {LANGUAGE_OPTIONS.map(([code, label]) => (
                            <option key={code} value={code}>
                              {code === "original"
                                ? transcriptData
                                  ? `Original language (${transcriptData.sourceLanguageName})`
                                  : "Original language / Auto-detect"
                                : label}
                            </option>
                          ))}
                        </Select>
                      </div>

                      {/* Available Caption Tracks selector (when multiple tracks exist) */}
                      {transcriptData.availableCaptionTracks && transcriptData.availableCaptionTracks.length > 1 ? (
                        <div className="flex items-center gap-1.5 text-xs shrink-0">
                          <span className="font-bold text-muted shrink-0">Source track:</span>
                          <Select
                            value={selectedTrackLanguage}
                            onChange={(e) => handleTrackChange(e.target.value)}
                            disabled={loadingTranscript || loadingTranslation}
                            className="!h-9 !py-0 !text-xs font-semibold"
                            aria-label="Select source caption track"
                          >
                            <option value="auto">Auto-detect ({transcriptData.captionTrackLanguage ?? "Best"})</option>
                            {transcriptData.availableCaptionTracks.map((tr) => (
                              <option key={tr.vssId || tr.languageCode} value={tr.languageCode}>
                                {tr.name} {tr.isAutomatic ? "(auto)" : "(manual)"}
                              </option>
                            ))}
                          </Select>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Language Status Indicator Banner */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-surface-muted/60 px-4 py-2.5 text-xs min-w-0">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-semibold text-foreground">
                        {transcriptData.isLanguageUncertain ? (
                          <span className="font-bold text-danger">Language could not be determined</span>
                        ) : (
                          <span>
                            Detected language: <strong>{transcriptData.sourceLanguageName}</strong>
                          </span>
                        )}
                      </span>
                      <span>•</span>
                      <span className="text-muted">
                        {isCurrentlyTranslated ? (
                          <span>
                            Translated to <strong>{displayLanguageName}</strong>
                          </span>
                        ) : (
                          <span>Original transcript</span>
                        )}
                      </span>
                      {transcriptData.languageDetectionMethod ? (
                        <>
                          <span>•</span>
                          <span className="text-[11px] text-muted capitalize">
                            ({transcriptData.languageDetectionMethod.replace(/_/g, " ")})
                          </span>
                        </>
                      ) : null}
                    </div>

                    {isCurrentlyTranslated ? (
                      <button
                        type="button"
                        onClick={() => handleLanguageChange("original")}
                        className="font-bold text-brand hover:underline shrink-0"
                      >
                        Reset to Original
                      </button>
                    ) : null}
                  </div>

                  {/* Translation Error Banner with Retry */}
                  {translationError ? (
                    <div className="border-b bg-danger-soft/80 p-3 text-xs text-danger min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="break-words">{translationError}</span>
                        <button
                          type="button"
                          onClick={() => handleLanguageChange(selectedOutputLanguage)}
                          className="font-bold underline hover:text-foreground shrink-0"
                        >
                          Retry Translation
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Loading Translation State */}
                  {loadingTranslation ? (
                    <div className="p-10 min-w-0">
                      <LoadingState label={`Translating transcript to ${displayLanguageName}…`} />
                    </div>
                  ) : filteredSegments.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center p-8 min-w-0">
                      <EmptyState
                        icon={Search}
                        title="No matching dialogue"
                        description={
                          searchFilter
                            ? `No transcript lines found matching "${searchFilter}".`
                            : "No dialogue segments available."
                        }
                        compact
                      />
                    </div>
                  ) : !showTimestamps ? (
                    /* CLEAN TRANSCRIPT VIEW (DEFAULT - MATCHING SCREENSHOT) */
                    <div
                      className="max-h-[580px] flex-1 overflow-y-auto p-4 sm:p-6 min-w-0"
                      tabIndex={0}
                      aria-label="Clean transcript dialogue in readable paragraphs"
                    >
                      <div className="space-y-4 min-w-0">
                        {filteredParagraphs.map((paragraph, idx) => (
                          <p
                            key={idx}
                            className="text-[15px] sm:text-base leading-[1.8] text-foreground tracking-normal break-words"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* TIMESTAMPED SEGMENTS VIEW (CLICKABLE VIDEO SEEKING) */
                    <div
                      className="max-h-[580px] flex-1 overflow-y-auto divide-y p-3 sm:p-5 min-w-0"
                      tabIndex={0}
                      aria-label="Video transcript segments with clickable timestamps"
                    >
                      {filteredSegments.map((segment, index) => (
                        <div
                          key={`${segment.start}-${index}`}
                          className="group flex items-start gap-3.5 py-2.5 transition hover:bg-surface-muted/60 min-w-0"
                        >
                          <button
                            type="button"
                            onClick={() => seekVideo(segment.start)}
                            className="flex shrink-0 items-center gap-1 rounded-md border border-brand/20 bg-brand-soft/60 px-2 py-0.5 font-mono text-[11px] font-bold text-brand-strong transition hover:bg-brand hover:text-white"
                            title={`Seek video to ${segment.timestamp}`}
                          >
                            <Play className="size-2.5" aria-hidden="true" />
                            <span>{segment.timestamp}</span>
                          </button>

                          <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground break-words">
                            {stripTimestampMarkers(segment.text)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {/* TAB 2: AI SUMMARY */}
              {activeTab === "summary" ? (
                <div
                  role="tabpanel"
                  id={`${tabListId}-panel-summary`}
                  aria-labelledby={`${tabListId}-tab-summary`}
                  className="flex flex-1 flex-col overflow-hidden"
                >
                  {/* Summary Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 border-b p-3 sm:px-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted">Depth:</span>
                        <div className="flex rounded-lg border bg-surface-muted p-0.5 text-xs font-semibold">
                          <button
                            type="button"
                            onClick={() => {
                              setSummaryType("concise");
                              handleGenerateSummary("concise");
                            }}
                            className={`rounded-md px-2.5 py-1 transition ${
                              summaryType === "concise"
                                ? "bg-surface-raised font-bold text-foreground shadow-xs"
                                : "text-muted hover:text-foreground"
                            }`}
                          >
                            Concise
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSummaryType("detailed");
                              handleGenerateSummary("detailed");
                            }}
                            className={`rounded-md px-2.5 py-1 transition ${
                              summaryType === "detailed"
                                ? "bg-surface-raised font-bold text-foreground shadow-xs"
                                : "text-muted hover:text-foreground"
                            }`}
                          >
                            Detailed
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-muted">Language:</span>
                        <Select
                          value={summaryLanguage}
                          onChange={(e) => setSummaryLanguage(e.target.value)}
                          className="!h-8 !py-0 !text-xs font-semibold"
                        >
                          <option value="original">Match transcript</option>
                          <option value="hi">Hindi (हिंदी)</option>
                          <option value="en">English</option>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="small"
                        onClick={() => handleGenerateSummary()}
                        disabled={loadingSummary}
                        title="Regenerate summary"
                      >
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                        <span>Regenerate</span>
                      </Button>

                      {summaryData ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="small"
                          onClick={handleCopySummary}
                          title="Copy full AI summary"
                        >
                          <Copy className="size-3.5" aria-hidden="true" />
                          <span>Copy Summary</span>
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {/* Summary Content Body */}
                  {loadingSummary ? (
                    <div className="p-12">
                      <LoadingState label="Analyzing transcript and generating AI summary…" />
                    </div>
                  ) : summaryData ? (
                    <div className="max-h-[580px] flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
                      {/* Overview Box */}
                      <div className="rounded-2xl border border-brand/20 bg-brand-soft/40 p-4 sm:p-5">
                        <div className="flex items-center gap-2">
                          <Sparkles className="size-4 text-brand-strong" aria-hidden="true" />
                          <h3 className="text-xs font-bold uppercase tracking-wider text-brand-strong">
                            Executive Overview
                          </h3>
                        </div>
                        <p className="mt-2.5 text-sm leading-relaxed text-foreground">
                          {summaryData.overview}
                        </p>
                      </div>

                      {/* Key Takeaways */}
                      {summaryData.keyTakeaways.length > 0 ? (
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                            Key Takeaways
                          </h4>
                          <ul className="mt-3 space-y-2">
                            {summaryData.keyTakeaways.map((takeaway, idx) => (
                              <li
                                key={idx}
                                className="flex items-start gap-2.5 rounded-xl border bg-surface-muted/40 p-3 text-sm text-foreground"
                              >
                                <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-brand/10 text-brand-strong">
                                  <Check className="size-3" aria-hidden="true" />
                                </span>
                                <span>{takeaway}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {/* Section Breakdowns */}
                      {summaryData.sections.length > 0 ? (
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                            Detailed Sections
                          </h4>
                          {summaryData.sections.map((section, idx) => (
                            <div key={idx} className="rounded-xl border bg-surface-muted/30 p-4">
                              <h5 className="text-sm font-bold text-foreground">{section.title}</h5>
                              <ul className="mt-2 space-y-1.5 pl-4 text-sm text-muted">
                                {section.points.map((point, pIdx) => (
                                  <li key={pIdx} className="list-disc leading-relaxed">
                                    {point}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="flex items-center justify-between border-t pt-4 text-xs text-muted">
                        <span>Generated by {summaryData.modelUsed}</span>
                        <span>{new Date(summaryData.generatedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center justify-center p-8">
                      <EmptyState
                        icon={Sparkles}
                        title="Generate AI Summary"
                        description="Click below to generate a structured AI summary based solely on the spoken transcript."
                        action={
                          <Button
                            type="button"
                            variant="primary"
                            onClick={() => handleGenerateSummary()}
                          >
                            <Sparkles className="size-4" aria-hidden="true" />
                            <span>Generate Summary</span>
                          </Button>
                        }
                      />
                    </div>
                  )}
                </div>
              ) : null}
            </Panel>
          </div>
        </div>
      ) : (
        /* Empty Idle State */
        <Panel className="p-12 text-center">
          <EmptyState
            icon={Video}
            title="Paste a YouTube link above"
            description="Enter a YouTube watch URL, Shorts link, or video ID to fetch clean captions without timestamps by default, interact with clickable timestamps, and generate structured AI summaries."
          />
        </Panel>
      )}
    </div>
  );
}
