import type { Metadata } from "next";
import { SavedResearchClient } from "@/components/pages/saved-research-client";

export const metadata: Metadata = {
  title: "Saved research",
  description: "Review projects, favorites, history, and settings saved in this browser.",
};

export default function SavedResearchPage() {
  return <SavedResearchClient />;
}
