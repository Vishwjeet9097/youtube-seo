import type { Metadata } from "next";
import { CompetitorClient } from "@/components/pages/competitor-client";

export const metadata: Metadata = {
  title: "Compare tags",
  description: "Compare tags from two or more videos to see what they have in common.",
};

export default function CompetitorPage() {
  return <CompetitorClient />;
}
