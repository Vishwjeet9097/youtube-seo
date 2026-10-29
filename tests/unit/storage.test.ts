import { describe, expect, it } from "vitest";
import { createDefaultWorkspace, createProject, exportWorkspaceJson, importWorkspaceJson, readWorkspace, WORKSPACE_STORAGE_KEY, writeWorkspace, type StorageLike } from "@/lib/storage";
import { testVideo } from "../fixtures";

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("versioned local workspace", () => {
  it("round-trips validated Unicode projects", () => {
    const storage = new MemoryStorage();
    const state = createDefaultWorkspace();
    const video = testVideo({ tags: ["छठ पूजा"] });
    state.projects.push(createProject("छठ पूजा", "extraction", {
      specification: { inputs: [video.id], channelLimit: 20, deduplicateTags: true },
      results: [{ input: video.id, normalizedId: video.id, kind: "video", status: "complete", videos: [video], error: null }],
    }));
    expect(writeWorkspace(storage, state)).toBeNull();
    const loaded = readWorkspace(storage);
    expect(loaded.available).toBe(true);
    expect(loaded.state.projects[0]?.name).toBe("छठ पूजा");
  });

  it("handles disabled or unreadable localStorage", () => {
    const broken: StorageLike = { getItem: () => { throw new Error("disabled"); }, setItem: () => { throw new Error("disabled"); }, removeItem: () => undefined };
    const read = readWorkspace(broken);
    expect(read.available).toBe(false);
    expect(read.error).toContain("disabled");
    expect(writeWorkspace(broken, createDefaultWorkspace())).toContain("disabled");
  });

  it("handles quota exhaustion without throwing", () => {
    const full: StorageLike = { getItem: () => null, setItem: () => { throw new DOMException("full", "QuotaExceededError"); }, removeItem: () => undefined };
    expect(writeWorkspace(full, createDefaultWorkspace())).toContain("full");
  });

  it("rejects malformed backups and accepts a valid export", () => {
    const state = createDefaultWorkspace();
    const json = exportWorkspaceJson(state);
    expect(importWorkspaceJson(json)).toEqual(state);
    expect(() => importWorkspaceJson("{bad json")).toThrow("not valid JSON");
    expect(() => importWorkspaceJson(JSON.stringify({ version: 99 }))).toThrow("not a valid");
  });

  it("migrates a safe legacy unversioned shape", () => {
    const storage = new MemoryStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ projects: [], activities: [], favoriteKeywords: ["test"], comparisonHistory: [], exportHistory: [], trendSnapshots: [] }));
    const loaded = readWorkspace(storage);
    expect(loaded.state.version).toBe(1);
    expect(loaded.state.preferences.defaultRegion).toBe("US");
  });
});
