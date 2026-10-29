export function cleanTranscriptText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

export function stripTimestampMarkers(text: string): string {
  return text
    // Remove bracketed timestamps like [00:05], [00:00:05], (00:05), [ 01:23 ]
    .replace(/(?:^|\s)[\[\(]\s*\d{1,2}:\d{2}(?::\d{2})?\s*[\]\)]\s*/gu, " ")
    // Remove leading timestamp like ^00:05 or ^00:00:05 with optional colon/dash
    .replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[-–—:]\s*)?/u, "")
    // Remove trailing timestamp at end of line if standing alone
    .replace(/\s*\d{1,2}:\d{2}(?::\d{2})?\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}
