const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE_PATTERN = /^@[A-Za-z0-9._-]{3,30}$/;

const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

export type ParsedYouTubeInput =
  | { kind: "video"; id: string; original: string }
  | {
      kind: "channel";
      id: string | null;
      handle: string | null;
      legacyName: string | null;
      original: string;
    }
  | { kind: "invalid"; reason: string; original: string };

export function isValidVideoId(value: string): boolean {
  return VIDEO_ID_PATTERN.test(value.trim());
}

export function isValidChannelId(value: string): boolean {
  return CHANNEL_ID_PATTERN.test(value.trim());
}

function cleanCandidate(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.trim().split(/[?&#/]/, 1)[0] ?? "";
  return isValidVideoId(candidate) ? candidate : null;
}

export function parseYouTubeInput(rawInput: string): ParsedYouTubeInput {
  const original = rawInput;
  const input = rawInput.trim();

  if (!input) {
    return { kind: "invalid", reason: "Enter a YouTube link, video ID, channel ID, or @handle.", original };
  }
  if (isValidVideoId(input)) return { kind: "video", id: input, original };
  if (isValidChannelId(input)) {
    return { kind: "channel", id: input, handle: null, legacyName: null, original };
  }
  if (HANDLE_PATTERN.test(input)) {
    return { kind: "channel", id: null, handle: input, legacyName: null, original };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { kind: "invalid", reason: "Enter a supported YouTube link, video ID, channel ID, or @handle.", original };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { kind: "invalid", reason: "Use a standard YouTube web link, video ID, channel ID, or @handle.", original };
  }
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    return { kind: "invalid", reason: "Use a link from youtube.com, youtube-nocookie.com, or youtu.be.", original };
  }
  if (url.username || url.password || url.port) {
    return { kind: "invalid", reason: "Use a YouTube link without sign-in details or an added port number.", original };
  }

  const hostname = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  let videoId: string | null = null;

  if (hostname === "youtu.be" || hostname === "www.youtu.be") {
    videoId = cleanCandidate(segments[0]);
  } else if (url.pathname === "/watch") {
    videoId = cleanCandidate(url.searchParams.get("v"));
  } else if (["shorts", "live", "embed", "v"].includes(segments[0] ?? "")) {
    videoId = cleanCandidate(segments[1]);
  }

  if (videoId) return { kind: "video", id: videoId, original };

  if (segments[0] === "channel" && isValidChannelId(segments[1] ?? "")) {
    return { kind: "channel", id: segments[1]!, handle: null, legacyName: null, original };
  }
  if (segments[0]?.startsWith("@") && HANDLE_PATTERN.test(segments[0])) {
    return { kind: "channel", id: null, handle: segments[0], legacyName: null, original };
  }
  if (["c", "user"].includes(segments[0] ?? "") && segments[1]) {
    return {
      kind: "channel",
      id: null,
      handle: null,
      legacyName: decodeURIComponent(segments[1]).slice(0, 100),
      original,
    };
  }

  return {
    kind: "invalid",
    reason: "Use a YouTube watch, Shorts, live, or channel link, or enter a video ID, channel ID, or @handle.",
    original,
  };
}

export function parseYouTubeInputLines(value: string, limit = 20): ParsedYouTubeInput[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > limit) throw new Error(`Enter a maximum of ${limit} YouTube links, IDs, or @handles.`);
  return lines.map(parseYouTubeInput);
}

export function youtubeVideoUrl(videoId: string): string {
  if (!isValidVideoId(videoId)) throw new Error("Use a valid 11-character YouTube video ID.");
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function isAllowedYouTubeHostname(hostname: string): boolean {
  return ALLOWED_HOSTS.has(hostname.toLowerCase());
}
