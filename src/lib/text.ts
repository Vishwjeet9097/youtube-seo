import type { VideoRecord } from "@/types/research";

const HASHTAG_PATTERN = /(^|[^\p{L}\p{M}\p{N}_])#([\p{L}\p{M}\p{N}_]{1,100})/gu;
const WORD_PATTERN = /[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}'’_-]*/gu;
const BASIC_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in",
  "is", "it", "of", "on", "or", "the", "this", "to", "vs", "what", "when", "with",
  "you", "your", "new", "official", "video", "का", "की", "के", "और", "में", "से", "है",
]);

export function normalizeForMatch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

export function normalizeHashtag(value: string): string {
  return normalizeForMatch(value.replace(/^#+/u, ""));
}

export function extractHashtags(text: string): string[] {
  const found = new Map<string, string>();
  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    const original = match[2];
    if (!original) continue;
    const key = normalizeHashtag(original);
    if (key && !found.has(key)) found.set(key, `#${original}`);
  }
  return [...found.values()];
}

export function dedupePreservingOriginal(values: readonly string[]): string[] {
  const unique = new Map<string, string>();
  for (const raw of values) {
    const value = raw.trim();
    const key = normalizeForMatch(value);
    if (key && !unique.has(key)) unique.set(key, value);
  }
  return [...unique.values()];
}

export function extractTitleTerms(title: string): { keywords: string[]; phrases: string[] } {
  const words = [...title.matchAll(WORD_PATTERN)]
    .map((match) => match[0]?.trim() ?? "")
    .filter((word) => {
      const normalized = normalizeForMatch(word);
      return normalized.length >= 2 && !BASIC_STOP_WORDS.has(normalized) && !/^\d+$/u.test(normalized);
    });
  const keywords = dedupePreservingOriginal(words);
  const phrases: string[] = [];
  for (let index = 0; index < words.length - 1; index += 1) {
    phrases.push(`${words[index]} ${words[index + 1]}`);
  }
  return { keywords, phrases: dedupePreservingOriginal(phrases) };
}

export function tagCharacterUsage(tags: readonly string[]): number {
  if (tags.length === 0) return 0;
  return tags.reduce((total, tag) => total + tag.length, 0) + tags.length - 1;
}

export function levenshteinDistance(left: string, right: string): number {
  const a = [...normalizeForMatch(left)];
  const b = [...normalizeForMatch(right)];
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return row[b.length];
}

export function findObservedVariations(seed: string, videos: readonly VideoRecord[]): Map<string, string[]> {
  const normalizedSeed = normalizeForMatch(seed);
  const seedCompact = normalizedSeed.replace(/[\s_-]+/gu, "");
  const observations = new Map<string, Set<string>>();

  for (const video of videos) {
    const sourceValues = [
      ...extractTitleTerms(video.title).keywords,
      ...(video.tags ?? []),
      ...video.hashtags.title,
      ...video.hashtags.description,
    ];
    for (const value of sourceValues) {
      const normalized = normalizeForMatch(value.replace(/^#/u, ""));
      const compact = normalized.replace(/[\s_-]+/gu, "");
      const threshold = Math.max(1, Math.min(3, Math.floor(normalizedSeed.length / 5)));
      if (
        normalized === normalizedSeed ||
        compact === seedCompact ||
        (normalized.length >= 4 && levenshteinDistance(normalized, normalizedSeed) <= threshold)
      ) {
        const links = observations.get(value) ?? new Set<string>();
        links.add(video.url);
        observations.set(value, links);
      }
    }
  }
  return new Map([...observations].map(([label, links]) => [label, [...links]]));
}

export function generatePotentialVariations(seed: string): string[] {
  const value = seed.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!value) return [];
  const candidates = new Set<string>();
  if (value.includes(" ")) {
    candidates.add(value.replaceAll(" ", ""));
    candidates.add(value.replaceAll(" ", "-"));
  }
  const characters = [...value];
  for (let index = 0; index < characters.length; index += 1) {
    if (/^[A-Za-z]$/u.test(characters[index] ?? "")) {
      candidates.add(characters.filter((_, charIndex) => charIndex !== index).join(""));
      if (index < characters.length - 1 && /^[A-Za-z]$/u.test(characters[index + 1] ?? "")) {
        const swapped = [...characters];
        [swapped[index], swapped[index + 1]] = [swapped[index + 1]!, swapped[index]!];
        candidates.add(swapped.join(""));
      }
    }
    if (candidates.size >= 10) break;
  }
  candidates.delete(value);
  return [...candidates].filter((candidate) => candidate.trim().length >= 2).slice(0, 10);
}
