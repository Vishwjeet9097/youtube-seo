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
  const map: Record<TrendStatus, { label: string; symbol: string; tone: "success" | "neutral" | "danger" | "warning" }> = {
    rising: { label: "Rising", symbol: "▲", tone: "success" },
    stable: { label: "Stable", symbol: "■", tone: "neutral" },
    falling: { label: "Falling", symbol: "▼", tone: "danger" },
    new_observation: { label: "No comparison yet", symbol: "○", tone: "warning" },
    unavailable: { label: "Not available", symbol: "-", tone: "neutral" },
  };
  const item = map[status];
  return (
    <Badge tone={item.tone}>
      <span className="font-mono text-[9px] font-bold opacity-80">{item.symbol}</span>
      <span>{item.label}{change !== null && change !== undefined ? ` ${change > 0 ? "+" : ""}${change}%` : ""}</span>
    </Badge>
  );
}
