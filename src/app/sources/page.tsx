import type { Metadata } from "next";
import { SourcesClient } from "@/components/pages/sources-client";

export const metadata: Metadata = {
  title: "Sources and methods",
  description: "Review source availability, metric definitions, methods, and limits.",
};

export default function SourcesPage() {
  return <SourcesClient />;
}
