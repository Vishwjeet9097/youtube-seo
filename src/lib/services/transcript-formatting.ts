import type { TranscriptSegmentItem } from "@/types/research";
import { cleanTranscriptText, stripTimestampMarkers } from "@/lib/services/transcript-cleaner";

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function normalizeSegments(
  rawItems: Array<{ text: string; offset: number; duration: number; lang?: string }>,
): TranscriptSegmentItem[] {
  const normalized: TranscriptSegmentItem[] = [];

  for (let i = 0; i < rawItems.length; i += 1) {
    const item = rawItems[i];
    if (!item) continue;
    const cleaned = stripTimestampMarkers(cleanTranscriptText(item.text));
    if (!cleaned) continue;

    // Deduplicate identical immediate consecutive segments
    const prev = normalized[normalized.length - 1];
    if (prev && prev.text.toLowerCase() === cleaned.toLowerCase()) {
      prev.duration = Math.max(prev.duration, item.offset / 1000 + item.duration / 1000 - prev.start);
      continue;
    }

    const startSeconds = Math.max(0, item.offset / 1000);
    const durationSeconds = Math.max(0, item.duration / 1000);

    normalized.push({
      text: cleaned,
      start: Number(startSeconds.toFixed(2)),
      duration: Number(durationSeconds.toFixed(2)),
      timestamp: formatTimestamp(startSeconds),
    });
  }

  return normalized;
}

export function formatTranscriptIntoParagraphs(segments: TranscriptSegmentItem[]): string[] {
  if (!segments || segments.length === 0) return [];
  const paragraphs: string[] = [];
  let currentGroup: string[] = [];
  let sentenceCount = 0;

  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i]!;
    const text = stripTimestampMarkers(s.text.trim());
    if (!text) continue;

    const prev = segments[i - 1];
    const pauseGap = prev ? s.start - (prev.start + prev.duration) : 0;

    currentGroup.push(text);

    // Recognizes English (.!?) and Hindi Devanagari (।॥) sentence boundaries
    const hasSentenceEnd = /[.!?।॥]\s*$/u.test(text);
    if (hasSentenceEnd) sentenceCount += 1;

    const currentWordCount = currentGroup.join(" ").split(/\s+/u).length;

    // Split paragraphs on meaningful pauses, sentence groups, or length thresholds
    if (
      (pauseGap > 3.5 && currentWordCount >= 15) ||
      (hasSentenceEnd && sentenceCount >= 3 && currentWordCount >= 35) ||
      (currentWordCount >= 75 && (hasSentenceEnd || pauseGap > 1.5))
    ) {
      paragraphs.push(currentGroup.join(" "));
      currentGroup = [];
      sentenceCount = 0;
    }
  }

  if (currentGroup.length > 0) {
    paragraphs.push(currentGroup.join(" "));
  }

  return paragraphs;
}

export function serializeTranscript(
  segments: TranscriptSegmentItem[],
  includeTimestamps: boolean,
): string {
  if (!segments || segments.length === 0) return "";
  if (includeTimestamps) {
    return segments
      .map((s) => `[${s.timestamp}] ${stripTimestampMarkers(s.text)}`)
      .join("\n");
  }
  const cleanParagraphs = formatTranscriptIntoParagraphs(segments);
  return cleanParagraphs.join("\n\n");
}
