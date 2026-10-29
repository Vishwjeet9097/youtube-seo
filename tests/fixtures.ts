import type { VideoRecord } from "@/types/research";

export function testVideo(overrides: Partial<VideoRecord> = {}): VideoRecord {
  return {
    id: "dQw4w9WgXcQ",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "TEST FIXTURE Chhath Puja #छठपूजा",
    description: "Test-only description #Devotional",
    channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
    channelTitle: "TEST FIXTURE Channel",
    publishedAt: "2026-10-26T10:00:00.000Z",
    thumbnailUrl: null,
    tags: ["Chhath Puja", "Devotional Songs"],
    tagStatus: "found",
    hashtags: { title: ["#छठपूजा"], description: ["#Devotional"] },
    statistics: { viewCount: 100, likeCount: 10, commentCount: 2 },
    durationSeconds: 120,
    categoryId: "10",
    observedAt: "2026-10-27T10:00:00.000Z",
    region: "IN",
    ...overrides,
  };
}
