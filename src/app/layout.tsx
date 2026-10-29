import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SourceLens — YouTube research with clear sources",
    template: "%s · SourceLens",
  },
  description: "Explore topic research, tag extraction, hashtag research, tag comparison, and short-term trends with source data, search-volume estimates, and local calculations kept separate.",
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
