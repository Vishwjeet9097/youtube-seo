import type { Metadata } from "next";
import { TrendingClient } from "@/components/pages/trending-client";

export const metadata: Metadata = {
  title: "Keyword trends",
  description: "Check how keyword interest and video tags change over time.",
};

export default function TrendingPage() {
  return <TrendingClient />;
}
