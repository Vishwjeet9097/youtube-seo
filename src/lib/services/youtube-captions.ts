import { AppError } from "@/lib/api/errors";
import { cleanTranscriptText } from "@/lib/services/transcript-cleaner";

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi (हिंदी)",
  es: "Spanish (Español)",
  fr: "French (Français)",
  de: "German (Deutsch)",
  it: "Italian (Italiano)",
  pt: "Portuguese (Português)",
  ru: "Russian (Русский)",
  ja: "Japanese (日本語)",
  ko: "Korean (한국어)",
  zh: "Chinese (中文)",
  ar: "Arabic (العربية)",
  bn: "Bengali (বাংলা)",
  ur: "Urdu (اردو)",
  id: "Indonesian",
  tr: "Turkish (Türkçe)",
  vi: "Vietnamese",
  nl: "Dutch",
  pl: "Polish",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  gu: "Gujarati",
  kn: "Kannada",
  pa: "Punjabi",
  und: "Undetermined",
};

export interface DiscoveredCaptionTrack {
  languageCode: string;
  name: string;
  vssId: string;
  kind?: string;
  isAutomatic: boolean;
  isTranslatable: boolean;
  baseUrl: string;
}

export interface RawTranscriptSegment {
  text: string;
  offset: number;
  duration: number;
  lang?: string;
}

export interface LanguageDetectionResult {
  code: string;
  name: string;
  method:
    | "devanagari_unicode_analysis"
    | "unicode_script_analysis"
    | "content_heuristic"
    | "latin_hinglish_analysis"
    | "segment_language_metadata"
    | "manual_caption_track"
    | "automatic_caption_track"
    | "metadata_audio_language"
    | "speech_to_text"
    | "user_specified"
    | "undetermined";
  isConfident: boolean;
}

const INNERTUBE_API_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_CLIENT_VERSION = "20.10.38";
const INNERTUBE_CONTEXT = {
  client: {
    clientName: "ANDROID",
    clientVersion: INNERTUBE_CLIENT_VERSION,
  },
};
const INNERTUBE_USER_AGENT = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export function normalizeLanguageCode(code: string | undefined | null): string {
  if (!code) return "";
  const clean = code.trim().toLowerCase();
  const base = clean.split(/[-_]/u)[0] ?? clean;
  return base;
}

export function getLanguageDisplayName(code: string): string {
  const base = normalizeLanguageCode(code);
  return LANGUAGE_NAMES[base] || LANGUAGE_NAMES[code] || code.toUpperCase();
}

/**
 * Extracts inline JSON assigned to a variable in HTML scripts (e.g. ytInitialPlayerResponse)
 */
export function parseInlineJson(html: string, globalName: string): Record<string, unknown> | null {
  const startToken = `var ${globalName} = `;
  const startIndex = html.indexOf(startToken);
  if (startIndex === -1) {
    // Try window[globalName] =
    const winToken = `window["${globalName}"] = `;
    const winIndex = html.indexOf(winToken);
    if (winIndex === -1) return null;
    return extractJsonObject(html, winIndex + winToken.length);
  }
  return extractJsonObject(html, startIndex + startToken.length);
}

function extractJsonObject(html: string, jsonStart: number): Record<string, unknown> | null {
  let depth = 0;
  for (let i = jsonStart; i < html.length; i += 1) {
    if (html[i] === "{") depth += 1;
    else if (html[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Parses raw track JSON objects from YouTube player response into DiscoveredCaptionTrack records
 */
export function parseCaptionTracksList(rawTracks: unknown[]): DiscoveredCaptionTrack[] {
  if (!Array.isArray(rawTracks)) return [];
  const tracks: DiscoveredCaptionTrack[] = [];

  for (const item of rawTracks) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const baseUrl = typeof t.baseUrl === "string" ? t.baseUrl : "";
    if (!baseUrl) continue;

    const languageCode = typeof t.languageCode === "string" ? t.languageCode : "";
    const vssId = typeof t.vssId === "string" ? t.vssId : "";
    const kind = typeof t.kind === "string" ? t.kind : undefined;
    const isTranslatable = Boolean(t.isTranslatable);

    let name = "";
    if (t.name && typeof t.name === "object") {
      const nameObj = t.name as Record<string, unknown>;
      if (typeof nameObj.simpleText === "string") {
        name = nameObj.simpleText;
      } else if (Array.isArray(nameObj.runs) && nameObj.runs[0] && typeof nameObj.runs[0] === "object") {
        const firstRun = nameObj.runs[0] as Record<string, unknown>;
        if (typeof firstRun.text === "string") name = firstRun.text;
      }
    }
    if (!name) {
      name = getLanguageDisplayName(languageCode);
    }

    const isAutomatic = kind === "asr" || vssId.startsWith("a.");

    tracks.push({
      languageCode,
      name,
      vssId,
      kind,
      isAutomatic,
      isTranslatable,
      baseUrl,
    });
  }

  return tracks;
}

/**
 * Discovers available caption tracks using InnerTube API with Web page fallback
 */
export async function discoverCaptionTracks(
  videoId: string,
  customFetch: typeof fetch = fetch,
): Promise<{
  tracks: DiscoveredCaptionTrack[];
  defaultAudioLanguage?: string;
  title?: string;
}> {
  // 1. Try InnerTube Player API first
  try {
    const resp = await customFetch(INNERTUBE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": INNERTUBE_USER_AGENT,
      },
      body: JSON.stringify({
        context: INNERTUBE_CONTEXT,
        videoId,
      }),
    });

    if (resp.ok) {
      const data = (await resp.json()) as Record<string, unknown>;
      const captions = data.captions as Record<string, unknown> | undefined;
      const tracklist = captions?.playerCaptionsTracklistRenderer as Record<string, unknown> | undefined;
      const rawTracks = tracklist?.captionTracks as unknown[] | undefined;
      const videoDetails = data.videoDetails as Record<string, unknown> | undefined;
      const defaultAudioLanguage =
        typeof videoDetails?.defaultAudioLanguage === "string" ? videoDetails.defaultAudioLanguage : undefined;
      const title = typeof videoDetails?.title === "string" ? videoDetails.title : undefined;

      const tracks = parseCaptionTracksList(rawTracks ?? []);
      if (tracks.length > 0) {
        return { tracks, defaultAudioLanguage, title };
      }
    }
  } catch {
    // Fall through to HTML scraping fallback
  }

  // 2. Web page HTML scraping fallback
  try {
    const pageResp = await customFetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
      },
    });

    if (pageResp.ok) {
      const html = await pageResp.text();
      const playerResponse = parseInlineJson(html, "ytInitialPlayerResponse");
      if (playerResponse) {
        const captions = playerResponse.captions as Record<string, unknown> | undefined;
        const tracklist = captions?.playerCaptionsTracklistRenderer as Record<string, unknown> | undefined;
        const rawTracks = tracklist?.captionTracks as unknown[] | undefined;
        const videoDetails = playerResponse.videoDetails as Record<string, unknown> | undefined;
        const defaultAudioLanguage =
          typeof videoDetails?.defaultAudioLanguage === "string" ? videoDetails.defaultAudioLanguage : undefined;
        const title = typeof videoDetails?.title === "string" ? videoDetails.title : undefined;

        const tracks = parseCaptionTracksList(rawTracks ?? []);
        if (tracks.length > 0) {
          return { tracks, defaultAudioLanguage, title };
        }
      }
    }
  } catch {
    // Fallback completed
  }

  return { tracks: [] };
}

/**
 * Deterministic caption track selection policy.
 * NEVER defaults to English or selects an English translated track over a native Hindi track.
 */
export function selectBestCaptionTrack(
  tracks: DiscoveredCaptionTrack[],
  options?: {
    preferredLang?: string;
    defaultAudioLanguage?: string;
    videoTitle?: string;
    videoDescription?: string;
  },
): DiscoveredCaptionTrack | null {
  if (!tracks || tracks.length === 0) return null;

  const req = options?.preferredLang?.trim().toLowerCase();
  const audioLang = normalizeLanguageCode(options?.defaultAudioLanguage);
  const titleHasDevanagari = options?.videoTitle ? /[\u0900-\u097F]/u.test(options.videoTitle) : false;
  const descHasDevanagari = options?.videoDescription ? /[\u0900-\u097F]/u.test(options.videoDescription) : false;
  const isEvidentlyHindi = titleHasDevanagari || descHasDevanagari;

  // Scenario 1: User explicitly requested a specific language (not "original" or "auto")
  if (req && req !== "original" && req !== "auto") {
    const reqBase = normalizeLanguageCode(req);

    // 1a. Manual track matching requested language
    const manualMatch = tracks.find(
      (t) => !t.isAutomatic && (t.languageCode.toLowerCase() === req || normalizeLanguageCode(t.languageCode) === reqBase),
    );
    if (manualMatch) return manualMatch;

    // 1b. Automatic track matching requested language
    const autoMatch = tracks.find(
      (t) => t.isAutomatic && (t.languageCode.toLowerCase() === req || normalizeLanguageCode(t.languageCode) === reqBase),
    );
    if (autoMatch) return autoMatch;

    // 1c. Any track matching base code
    const anyMatch = tracks.find((t) => normalizeLanguageCode(t.languageCode) === reqBase);
    if (anyMatch) return anyMatch;
  }

  // Scenario 2: Original language requested (or default behavior)
  // Step 2a: If video metadata explicitly specifies defaultAudioLanguage (e.g. "hi" or "hi-IN")
  if (audioLang) {
    const audioManual = tracks.find((t) => !t.isAutomatic && normalizeLanguageCode(t.languageCode) === audioLang);
    if (audioManual) return audioManual;

    const audioAuto = tracks.find((t) => t.isAutomatic && normalizeLanguageCode(t.languageCode) === audioLang);
    if (audioAuto) return audioAuto;
  }

  // Step 2b: Prefer verified original Hindi track when the content is Hindi.
  // In YouTube, an ASR track in Hindi (a.hi) is ONLY generated when the spoken audio is Hindi.
  // When YouTube provides both an English track (a.en-US) and a Hindi track (a.hi),
  // the English track is an auto-dubbed/translated track and the Hindi track is the native audio track!
  const hindiManual = tracks.find((t) => !t.isAutomatic && normalizeLanguageCode(t.languageCode) === "hi");
  const hindiAuto = tracks.find((t) => t.isAutomatic && normalizeLanguageCode(t.languageCode) === "hi");

  if (hindiManual) {
    // If there is evidence of Hindi (title/description) or no English manual track, prefer Hindi manual
    if (isEvidentlyHindi || !tracks.some((t) => !t.isAutomatic && normalizeLanguageCode(t.languageCode) === "en")) {
      return hindiManual;
    }
  }

  if (hindiAuto) {
    // YouTube only produces Hindi ASR if the spoken speech is Hindi.
    // Never select an English translation ASR track over the original Hindi ASR track!
    return hindiAuto;
  }

  if (hindiManual) {
    return hindiManual;
  }

  // Step 2c: Prefer Indic / regional language original tracks
  const regionalCodes = ["bn", "pa", "gu", "ta", "te", "kn", "mr", "ur", "ml", "or", "as"];
  const regionalManual = tracks.find((t) => !t.isAutomatic && regionalCodes.includes(normalizeLanguageCode(t.languageCode)));
  if (regionalManual) return regionalManual;

  const regionalAuto = tracks.find((t) => t.isAutomatic && regionalCodes.includes(normalizeLanguageCode(t.languageCode)));
  if (regionalAuto) return regionalAuto;

  // Step 2d: Prefer creator-provided manual captions over auto-generated captions
  const manualTracks = tracks.filter((t) => !t.isAutomatic);
  if (manualTracks.length > 0) {
    return manualTracks[0]!;
  }

  // Step 2e: Automatic speech recognition tracks
  const asrTracks = tracks.filter((t) => t.isAutomatic);
  if (asrTracks.length > 0) {
    // Prefer non-English ASR if available (prevents English translation bias)
    const nonEnglishAsr = asrTracks.find((t) => normalizeLanguageCode(t.languageCode) !== "en");
    if (nonEnglishAsr) return nonEnglishAsr;
    return asrTracks[0]!;
  }

  // Step 2f: First available track fallback
  return tracks[0] ?? null;
}

/**
 * Fetches transcript XML from YouTube timedtext baseUrl and parses it into segment objects.
 */
export async function fetchTranscriptFromUrl(
  transcriptUrl: string,
  langCode: string,
  customFetch: typeof fetch = fetch,
): Promise<RawTranscriptSegment[]> {
  try {
    const parsedUrl = new URL(transcriptUrl);
    if (!parsedUrl.hostname.endsWith(".youtube.com") && !parsedUrl.hostname.endsWith(".googlevideo.com")) {
      throw new AppError("INVALID_TRANSCRIPT_URL", "Transcript URL domain is not authorized.", 400, false);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("INVALID_TRANSCRIPT_URL", "Invalid transcript URL provided.", 400, false);
  }

  const response = await customFetch(transcriptUrl, {
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      "Accept-Language": langCode,
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new AppError(
        "YOUTUBE_RATE_LIMIT",
        "YouTube request rate limit reached. Please wait a moment and try again.",
        429,
        true,
      );
    }
    throw new AppError("TRANSCRIPT_FETCH_FAILED", `Failed to retrieve captions from YouTube (${response.status}).`, 502, true);
  }

  const body = await response.text();
  return parseTranscriptXmlText(body, langCode);
}

/**
 * Parses transcript XML supporting both srv3 format (<p t="ms" d="ms">) and classic format (<text start="s" dur="s">)
 */
export function parseTranscriptXmlText(xml: string, lang: string): RawTranscriptSegment[] {
  const results: RawTranscriptSegment[] = [];

  // 1. Try srv3 format: <p t="ms" d="ms"><s>word</s>...</p>
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/gu;
  let match: RegExpExecArray | null;

  while ((match = pRegex.exec(xml)) !== null) {
    const startMs = parseInt(match[1]!, 10);
    const durMs = parseInt(match[2]!, 10);
    const inner = match[3]!;
    let text = "";

    const sRegex = /<s[^>]*>([^<]*)<\/s>/gu;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1];
    }
    if (!text) {
      text = inner.replace(/<[^>]+>/gu, "");
    }

    const cleaned = cleanTranscriptText(text);
    if (cleaned) {
      results.push({
        text: cleaned,
        duration: durMs,
        offset: startMs,
        lang,
      });
    }
  }

  if (results.length > 0) return results;

  // 2. Try classic format: <text start="s" dur="s">content</text>
  const textRegex = /<text\s+start="([^"]*)"(?:\s+dur="([^"]*)")?[^>]*>([\s\S]*?)<\/text>/gu;
  while ((match = textRegex.exec(xml)) !== null) {
    const startSec = parseFloat(match[1]!);
    const durSec = match[2] ? parseFloat(match[2]) : 2.0;
    const rawContent = match[3]!;
    const cleaned = cleanTranscriptText(rawContent);
    if (cleaned) {
      results.push({
        text: cleaned,
        offset: Math.round(startSec * 1000),
        duration: Math.round(durSec * 1000),
        lang,
      });
    }
  }

  return results;
}

const COMMON_ENGLISH_WORDS_RE =
  /\b(the|and|is|to|in|it|you|that|he|was|for|on|are|as|with|his|they|at|be|this|have|from|or|one|had|by|word|but|not|what|all|were|we|when|your|can|said|there|use|an|each|which|she|do|how|their|if|will|up|other|about|out|many|then|them|these|so|some|her|would|make|like|him|into|time|has|look|two|more|write|go|see|number|no|way|could|people|my|than|first|water|been|call|who|oil|its|now|find|long|down|day|did|get|come|made|may|part|hello|welcome|everyone|episode|tutorial|video)\b/gi;

const COMMON_HINGLISH_WORDS_RE =
  /\b(kya|kyun|kyu|kaise|kaisa|kaisi|nahi|nhi|nahin|hai|hain|hoga|hogi|hoge|yeh|ye|woh|wo|mera|meri|mere|tera|teri|tere|humara|humari|aap|hum|tum|bhi|toh|tha|thi|raha|rahi|rahe|karo|karna|karta|karti|karte|accha|achha|achhi|achhe|bohot|bahut|hota|hoti|hote|baat|baatein|dosto|dost|kuch|sab|jab|tab|yahan|wahan|apna|apne|apni|bhai|yaar|lekin|magar|sirf|kripya)\b/gi;

/**
 * Validates dialogue text and track metadata to identify genuine spoken language.
 * Never defaults to English without clear evidence.
 */
export function detectLanguageFromContent(
  text: string,
  track?: DiscoveredCaptionTrack | null,
  defaultAudioLang?: string,
  itemLang?: string,
): LanguageDetectionResult {
  // 1. Devanagari Unicode check (Hindi, Marathi, Nepali, etc.)
  if (/[\u0900-\u097F]/u.test(text)) {
    return {
      code: "hi",
      name: LANGUAGE_NAMES.hi ?? "Hindi (हिंदी)",
      method: "devanagari_unicode_analysis",
      isConfident: true,
    };
  }

  // 2. Other distinct scripts
  if (/[\u0980-\u09FF]/u.test(text)) {
    return { code: "bn", name: LANGUAGE_NAMES.bn ?? "Bengali", method: "unicode_script_analysis", isConfident: true };
  }
  if (/[\u0A00-\u0A7F]/u.test(text)) {
    return { code: "pa", name: LANGUAGE_NAMES.pa ?? "Punjabi", method: "unicode_script_analysis", isConfident: true };
  }
  if (/[\u0A80-\u0AFF]/u.test(text)) {
    return { code: "gu", name: LANGUAGE_NAMES.gu ?? "Gujarati", method: "unicode_script_analysis", isConfident: true };
  }
  if (/[\u0B80-\u0BFF]/u.test(text)) {
    return { code: "ta", name: LANGUAGE_NAMES.ta ?? "Tamil", method: "unicode_script_analysis", isConfident: true };
  }
  if (/[\u0C00-\u0C7F]/u.test(text)) {
    return { code: "te", name: LANGUAGE_NAMES.te ?? "Telugu", method: "unicode_script_analysis", isConfident: true };
  }
  if (/[\u0C80-\u0CFF]/u.test(text)) {
    return { code: "kn", name: LANGUAGE_NAMES.kn ?? "Kannada", method: "unicode_script_analysis", isConfident: true };
  }
  if (/[\u0600-\u06FF]/u.test(text)) {
    const isUrdu = track?.languageCode === "ur" || defaultAudioLang === "ur";
    const code = isUrdu ? "ur" : "ar";
    return { code, name: LANGUAGE_NAMES[code] ?? code.toUpperCase(), method: "unicode_script_analysis", isConfident: true };
  }
  if (/[\u4E00-\u9FFF]/u.test(text)) {
    return { code: "zh", name: LANGUAGE_NAMES.zh ?? "Chinese", method: "unicode_script_analysis", isConfident: true };
  }
  if (/[\u3040-\u309F\u30A0-\u30FF]/u.test(text)) {
    return { code: "ja", name: LANGUAGE_NAMES.ja ?? "Japanese", method: "unicode_script_analysis", isConfident: true };
  }
  if (/[\uAC00-\uD7AF]/u.test(text)) {
    return { code: "ko", name: LANGUAGE_NAMES.ko ?? "Korean", method: "unicode_script_analysis", isConfident: true };
  }
  if (/[\u0400-\u04FF]/u.test(text)) {
    return { code: "ru", name: LANGUAGE_NAMES.ru ?? "Russian", method: "unicode_script_analysis", isConfident: true };
  }

  const englishMatches = text.match(COMMON_ENGLISH_WORDS_RE) || [];
  const hinglishMatches = text.match(COMMON_HINGLISH_WORDS_RE) || [];

  // 3. English content analysis for Latin script
  if (englishMatches.length >= 2 && englishMatches.length >= hinglishMatches.length) {
    return {
      code: "en",
      name: "English",
      method: "content_heuristic",
      isConfident: true,
    };
  }

  // 4. Romanized Hindi (Hinglish) analysis for Latin script
  if (hinglishMatches.length >= 2 && hinglishMatches.length > englishMatches.length) {
    return {
      code: "hi",
      name: LANGUAGE_NAMES.hi ?? "Hindi (हिंदी)",
      method: "latin_hinglish_analysis",
      isConfident: true,
    };
  }

  // 5. Caption track metadata validation
  const trackBase = track ? normalizeLanguageCode(track.languageCode) : "";
  if (track && trackBase && trackBase !== "und") {
    const method = track.isAutomatic ? "automatic_caption_track" : "manual_caption_track";
    return {
      code: trackBase,
      name: LANGUAGE_NAMES[trackBase] ?? track.name ?? trackBase.toUpperCase(),
      method,
      isConfident: true,
    };
  }

  // 6. Segment language metadata validation (e.g. from YouTubeTranscript result)
  const itemBase = itemLang ? normalizeLanguageCode(itemLang) : "";
  if (itemBase && itemBase !== "und") {
    return {
      code: itemBase,
      name: LANGUAGE_NAMES[itemBase] ?? itemBase.toUpperCase(),
      method: "segment_language_metadata",
      isConfident: true,
    };
  }

  // 7. Default audio language metadata from YouTube video details
  if (defaultAudioLang) {
    const baseCode = normalizeLanguageCode(defaultAudioLang);
    if (baseCode && baseCode !== "und") {
      return {
        code: baseCode,
        name: LANGUAGE_NAMES[baseCode] ?? baseCode.toUpperCase(),
        method: "metadata_audio_language",
        isConfident: true,
      };
    }
  }

  // 8. If text cannot be reliably identified, report uncertainty rather than assuming English!
  return {
    code: "und",
    name: "Language could not be determined",
    method: "undetermined",
    isConfident: false,
  };
}
