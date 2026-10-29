import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SourceLens — Find and research YouTube content",
    template: "%s · SourceLens",
  },
  description: "Explore video transcripts, tags, topics, hashtags, and trends in one place.",
  applicationName: "SourceLens",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eaf3f2" },
    { media: "(prefers-color-scheme: dark)", color: "#071715" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning><AppShell>{children}</AppShell></body>
    </html>
  );
}
