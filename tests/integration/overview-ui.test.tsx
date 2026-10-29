// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OverviewClient } from "@/components/pages/overview-client";
import { resetWorkspace, updateWorkspace } from "@/hooks/use-workspace";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

describe("OverviewClient (Dashboard) redesign", () => {
  beforeEach(() => {
    localStorage.clear();
    resetWorkspace();
    mockPush.mockClear();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the dashboard header, eyebrow, and data collection link", () => {
    render(<OverviewClient />);

    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
    expect(screen.getByText("Your YouTube research tools")).toBeInTheDocument();
    expect(
      screen.getByText("Find video details, discover related keywords, and compare tags and hashtags in one place."),
    ).toBeInTheDocument();

    const collectionLink = screen.getByRole("link", { name: /How data is collected/i });
    expect(collectionLink).toHaveAttribute("href", "/sources");
  });

  it("renders the primary research search card and controls", () => {
    render(<OverviewClient />);

    expect(screen.getByText("GET STARTED")).toBeInTheDocument();
    expect(screen.getByText("What do you want to research?")).toBeInTheDocument();

    const input = screen.getByLabelText("Enter a topic or paste a YouTube link");
    expect(input).toBeInTheDocument();

    const select = screen.getByLabelText("Choose research tool");
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Topic research" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Transcripts & summaries" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Tag extractor" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Keyword trends" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Hashtag research" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Compare tags" })).toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: /Start research/i });
    expect(submitButton).toBeDisabled();
  });

  it("renders the honest results data integrity panel", () => {
    render(<OverviewClient />);

    expect(screen.getByText("HONEST RESULTS")).toBeInTheDocument();
    expect(screen.getByText("We don’t make up numbers")).toBeInTheDocument();
    expect(
      screen.getByText("If a source does not provide a value, we show it as unavailable instead of guessing."),
    ).toBeInTheDocument();

    const learnLink = screen.getByRole("link", { name: /Learn about our data/i });
    expect(learnLink).toHaveAttribute("href", "/sources");
  });

  it("renders all 5 metric cards with real data values", () => {
    render(<OverviewClient />);

    expect(screen.getByText("Saved videos")).toBeInTheDocument();
    expect(screen.getByText("Saved tags")).toBeInTheDocument();
    expect(screen.getByText("Saved hashtags")).toBeInTheDocument();
    expect(screen.getByText("Keywords with search data")).toBeInTheDocument();
    expect(screen.getByText("Saved trend data")).toBeInTheDocument();
  });

  it("renders the 6 research tools with descriptions and links", () => {
    render(<OverviewClient />);

    expect(screen.getByText("Choose a research tool")).toBeInTheDocument();
    expect(screen.getByText("6 tools")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Transcripts & summaries/i })).toHaveAttribute("href", "/transcript");
    expect(screen.getByRole("link", { name: /Topic research/i })).toHaveAttribute("href", "/keywords");
    expect(screen.getByRole("link", { name: /Tag extractor/i })).toHaveAttribute("href", "/extract");
    expect(screen.getByRole("link", { name: /Keyword trends/i })).toHaveAttribute("href", "/trending");
    expect(screen.getByRole("link", { name: /Hashtag research/i })).toHaveAttribute("href", "/hashtags");
    expect(screen.getByRole("link", { name: /Compare tags/i })).toHaveAttribute("href", "/competitors");
  });

  it("renders empty state for recent research when no activities exist", () => {
    render(<OverviewClient />);

    expect(screen.getByText("Your recent research")).toBeInTheDocument();
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start researching/i })).toHaveAttribute("href", "/keywords");
  });

  it("renders activity items when research history exists", () => {
    updateWorkspace((state) => ({
      ...state,
      activities: [
        {
          id: "act-1",
          operation: "research",
          label: "indie game dev",
          resultCount: 12,
          createdAt: new Date().toISOString(),
        },
      ],
    }));

    render(<OverviewClient />);

    expect(screen.getByText("indie game dev")).toBeInTheDocument();
    expect(screen.getByText(/Topic research · 12 results/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View results" })).toHaveAttribute("href", "/keywords?query=indie%20game%20dev");
  });

  it("allows entering a query and launching research via button and enter key", async () => {
    const user = userEvent.setup();
    render(<OverviewClient />);

    const input = screen.getByLabelText("Enter a topic or paste a YouTube link");
    await user.type(input, "react tutorials");

    const submitButton = screen.getByRole("button", { name: /Start research/i });
    expect(submitButton).toBeEnabled();

    await user.click(submitButton);
    expect(mockPush).toHaveBeenCalledWith("/keywords?query=react%20tutorials");

    mockPush.mockClear();
    await user.keyboard("{Enter}");
    expect(mockPush).toHaveBeenCalledWith("/keywords?query=react%20tutorials");
  });

  it("validates video URL requirements when specific operations are selected", async () => {
    const user = userEvent.setup();
    render(<OverviewClient />);

    const input = screen.getByLabelText("Enter a topic or paste a YouTube link");
    const select = screen.getByLabelText("Choose research tool");

    await user.selectOptions(select, "transcript");
    await user.type(input, "not a video link");

    expect(screen.getByText("Paste a YouTube video link to get its transcript.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start research/i })).toBeDisabled();

    await user.clear(input);
    await user.type(input, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(screen.queryByText("Paste a YouTube video link to get its transcript.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start research/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /Start research/i }));
    expect(mockPush).toHaveBeenCalledWith(
      "/transcript?input=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ",
    );
  });
});
