import type { Metadata } from "next";
import { KeywordResearchClient } from "@/components/pages/keyword-research-client";

export const metadata: Metadata = {
  title: "Topic research",
  description: "Research a YouTube topic using suggestions, public video data, and available search-volume estimates in separate categories.",
};

export default function KeywordResearchPage() {
  return <KeywordResearchClient />;
}
