// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagExtractorClient } from "@/components/pages/tag-extractor-client";
import { resetWorkspace } from "@/hooks/use-workspace";

const envelope = {
  ok: true,
  data: [{
    input: "dQw4w9WgXcQ", normalizedId: "dQw4w9WgXcQ", kind: "video", status: "complete", error: null,
    videos: [{
      id: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "TEST UI FIXTURE", description: "#Fixture", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", channelTitle: "TEST CHANNEL", publishedAt: "2026-10-26T10:00:00.000Z", thumbnailUrl: null, tags: [], tagStatus: "empty", hashtags: { title: [], description: ["#Fixture"] }, statistics: { viewCount: 10, likeCount: null, commentCount: null }, durationSeconds: 60, categoryId: "27", observedAt: "2026-10-27T10:00:00.000Z", region: null,
    }],
  }],
  meta: { source: "TEST MOCK API", retrievedAt: "2026-10-27T10:00:00.000Z", cached: false, cacheAgeSeconds: null, sampleSize: 1, region: null, language: null, warnings: [] },
  error: null,
};

describe("tag extractor browser flow", () => {
  beforeEach(() => {
    localStorage.clear(); resetWorkspace(); window.history.replaceState({}, "", "/extract");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(envelope), { status: 200, headers: { "content-type": "application/json" } })));
  });

  it("submits a video ID and honestly renders an empty public tag state", async () => {
    const user = userEvent.setup();
    render(<TagExtractorClient />);
    await user.type(screen.getByLabelText("YouTube videos or channels"), "dQw4w9WgXcQ");
    await user.click(screen.getByRole("button", { name: "Extract tags" }));
    expect(await screen.findByText("TEST UI FIXTURE")).toBeInTheDocument();
    expect(screen.getAllByText(/No public tags/).length).toBeGreaterThan(0);
    expect(screen.queryByText("TEST UI FIXTURE", { selector: "button" })).not.toBeInTheDocument();
  });
});
