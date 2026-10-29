import type { Metadata } from "next";
import { HashtagResearchClient } from "@/components/pages/hashtag-research-client";

export const metadata: Metadata = {
  title: "Hashtag research",
  description: "Analyze hashtags found in public YouTube video titles and descriptions with clear source context.",
};

export default function HashtagResearchPage() {
  return <HashtagResearchClient />;
}
