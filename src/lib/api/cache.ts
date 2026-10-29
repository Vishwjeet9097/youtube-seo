interface CacheEntry<T> { value: T; storedAt: number; expiresAt: number }
export interface CacheLookup<T> { value: T; cached: boolean; storedAt: number }

export class BoundedTtlCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly pending = new Map<string, Promise<CacheEntry<unknown>>>();

  constructor(private readonly maxEntries = 200) {}

  async getOrSet<T>(key: string, ttlMs: number, factory: () => Promise<T>): Promise<CacheLookup<T>> {
    const now = Date.now();
    const existing = this.entries.get(key) as CacheEntry<T> | undefined;
    if (existing && existing.expiresAt > now) {
      this.entries.delete(key); this.entries.set(key, existing);
      return { value: existing.value, cached: true, storedAt: existing.storedAt };
    }
    if (existing) this.entries.delete(key);

    const inFlight = this.pending.get(key) as Promise<CacheEntry<T>> | undefined;
    if (inFlight) {
      const shared = await inFlight;
      return { value: shared.value, cached: true, storedAt: shared.storedAt };
    }

    const operation = (async (): Promise<CacheEntry<T>> => {
      const value = await factory();
      const storedAt = Date.now();
      const entry = { value, storedAt, expiresAt: storedAt + Math.max(0, ttlMs) };
      this.entries.set(key, entry);
      this.prune(storedAt);
      return entry;
    })();
    this.pending.set(key, operation as Promise<CacheEntry<unknown>>);
    try {
      const entry = await operation;
      return { value: entry.value, cached: false, storedAt: entry.storedAt };
    } finally {
      this.pending.delete(key);
    }
  }

  clear(): void { this.entries.clear(); this.pending.clear(); }
  get size(): number { return this.entries.size; }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
    }
  }
}

export const externalDataCache = new BoundedTtlCache(250);
