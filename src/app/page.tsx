import type { Metadata } from "next";
import { OverviewClient } from "@/components/pages/overview-client";

export const metadata: Metadata = {
  title: "Overview",
  description: "Start topic research, review saved metrics, and open tools with clear source context.",
};

export default function OverviewPage() {
  return <OverviewClient />;
}
