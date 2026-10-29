import type { Metadata } from "next";
import { TrendingClient } from "@/components/pages/trending-client";

export const metadata: Metadata = {
  title: "Short-term trends",
  description: "Measure how often terms appear in time-filtered video samples or regional popular-video samples.",
};

export default function TrendingPage() {
  return <TrendingClient />;
}
