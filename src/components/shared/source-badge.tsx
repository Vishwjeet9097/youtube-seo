import { Badge } from "@/components/shared/ui";
import type { SourceType, TrendStatus } from "@/types/research";

const SOURCE_LABELS: Record<SourceType, string> = {
  youtube_video: "Video details",
  youtube_search: "Videos in sample",
  youtube_suggestion: "YouTube autocomplete",
  youtube_popular: "Popular videos",
  google_trends: "Google Trends",
  keyword_provider: "Reported search volume",
  local_calculation: "Calculated from sample",
  generated_candidate: "Generated variant",
};

export function SourceBadge({ source }: { source: SourceType }) {
  const tone = source === "generated_candidate" ? "warning" : source === "keyword_provider" || source === "google_trends" ? "info" : source === "local_calculation" ? "neutral" : "brand";
  return <Badge tone={tone}>{SOURCE_LABELS[source]}</Badge>;
}

export function TrendBadge({ status, change }: { status: TrendStatus; change?: number | null }) {
  const map: Record<TrendStatus, { label: string; tone: "success" | "neutral" | "danger" | "warning" }> = {
    rising: { label: "Rising", tone: "success" },
    stable: { label: "Stable", tone: "neutral" },
    falling: { label: "Falling", tone: "danger" },
    new_observation: { label: "No comparison yet", tone: "warning" },
    unavailable: { label: "Not available", tone: "neutral" },
  };
  const item = map[status];
  return <Badge tone={item.tone}>{item.label}{change !== null && change !== undefined ? ` ${change > 0 ? "+" : ""}${change}%` : ""}</Badge>;
}
