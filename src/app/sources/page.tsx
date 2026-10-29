import type { Metadata } from "next";
import { SourcesClient } from "@/components/pages/sources-client";

export const metadata: Metadata = {
  title: "Data sources",
  description: "See how we collect data, what each number means, and where our estimates come from.",
};

export default function SourcesPage() {
  return <SourcesClient />;
}
