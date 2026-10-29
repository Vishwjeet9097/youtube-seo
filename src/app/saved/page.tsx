import type { Metadata } from "next";
import { SavedResearchClient } from "@/components/pages/saved-research-client";

export const metadata: Metadata = {
  title: "Saved items",
  description: "Review saved research, favorite keywords, search history, and settings on this device.",
};

export default function SavedResearchPage() {
  return <SavedResearchClient />;
}
