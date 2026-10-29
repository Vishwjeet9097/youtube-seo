export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Not available";
  return new Intl.NumberFormat("en", { notation: value >= 100_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

export function formatDate(value: string | null | undefined, includeTime = false): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

export function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds === null) return "Unknown duration";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function pluralize(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}
