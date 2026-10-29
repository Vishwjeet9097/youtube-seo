import type { Metadata } from "next";
import { CompetitorClient } from "@/components/pages/competitor-client";

export const metadata: Metadata = {
  title: "Tag comparison",
  description: "Compare public tags, title words, and hashtags across channels without filling in missing data.",
};

export default function CompetitorPage() {
  return <CompetitorClient />;
}
