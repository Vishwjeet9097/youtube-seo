import type { Metadata } from "next";
import { TranscriptClient } from "@/components/pages/transcript-client";

export const metadata: Metadata = {
  title: "YouTube Transcript & AI Summary",
  description: "Extract accurate YouTube video transcripts with synchronized timestamps, generate structured AI summaries, and translate across languages.",
};

export default function TranscriptPage() {
  return <TranscriptClient />;
}
