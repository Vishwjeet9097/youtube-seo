import type { Metadata } from "next";
import { TranscriptClient } from "@/components/pages/transcript-client";

export const metadata: Metadata = {
  title: "Transcripts & summaries",
  description: "Get a video transcript and a short summary.",
};

export default function TranscriptPage() {
  return <TranscriptClient />;
}
