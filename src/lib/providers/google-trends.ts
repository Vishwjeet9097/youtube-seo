import type { ProviderStatus, TrendsProvider } from "@/lib/providers/types";

export class ManualGoogleTrendsProvider implements TrendsProvider {
  readonly status: ProviderStatus = {
    id: "google-trends-manual",
    name: "Google Trends manual import",
    configured: true,
    live: false,
    supplies: ["Relative search interest scaled from 0 to 100 within the imported selection", "Related and rising queries when the imported file includes them"],
    limitation: "Results are not live and cover only the search type, region, and timeframe chosen for the export. Import a Google Trends file with those details; values show relative interest, not search counts.",
  };
}
