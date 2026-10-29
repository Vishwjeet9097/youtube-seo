import type { Metadata } from "next";
import { OverviewClient } from "@/components/pages/overview-client";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Find video details, discover related keywords, and compare tags and hashtags in one place.",
};

export default function OverviewPage() {
  return <OverviewClient />;
}
