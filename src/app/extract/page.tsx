import type { Metadata } from "next";
import { TagExtractorClient } from "@/components/pages/tag-extractor-client";

export const metadata: Metadata = {
  title: "Tag extractor",
  description: "View public tags from a YouTube video or recent channel uploads, with clear source context.",
};

export default function TagExtractorPage() {
  return <TagExtractorClient />;
}
