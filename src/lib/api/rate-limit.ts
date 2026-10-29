import { AppError } from "@/lib/api/errors";
import { parseYouTubeInput } from "@/lib/youtube-url";

interface Bucket { count: number; resetAt: number }

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  constructor(private readonly limit: number, private readonly windowMs: number, private readonly maxBuckets = 5_000) {}

  check(key: string, now = Date.now(), cost = 1): { remaining: number; resetAt: number } {
    const safeCost = Math.max(1, Math.min(this.limit + 1, Math.ceil(cost)));
    const current = this.buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + this.windowMs } : current;
    bucket.count += safeCost;
    this.buckets.set(key, bucket);
    this.prune(now);
    if (bucket.count > this.limit) throw new AppError("RATE_LIMITED", "The request limit has been reached. Try again in one minute.", 429, true);
    return { remaining: Math.max(0, this.limit - bucket.count), resetAt: bucket.resetAt };
  }

  reset(): void { this.buckets.clear(); }
  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
    while (this.buckets.size > this.maxBuckets) {
      const first = this.buckets.keys().next().value as string | undefined;
      if (!first) break;
      this.buckets.delete(first);
    }
  }
}

const configuredLimit = Number.parseInt(process.env.API_RATE_LIMIT_PER_MINUTE ?? "60", 10);
export const apiRateLimiter = new FixedWindowRateLimiter(Number.isFinite(configuredLimit) ? Math.min(600, Math.max(10, configuredLimit)) : 60, 60_000);

export function requestIdentity(request: Request): string {
  if (process.env.TRUST_PROXY_HEADERS !== "true") return "shared-untrusted-proxy";
  const cloudflare = request.headers.get("cf-connecting-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return (cloudflare || forwarded || realIp || "trusted-proxy-unknown").slice(0, 100);
}

export function estimateYouTubeInputCost(inputs: readonly string[]): { cost: number; channelCount: number } {
  let channelCount = 0;
  let videoCount = 0;
  for (const input of inputs) {
    const parsed = parseYouTubeInput(input);
    if (parsed.kind === "channel") channelCount += 1;
    if (parsed.kind === "video") videoCount += 1;
  }
  return { cost: (videoCount > 0 ? 1 : 0) + channelCount * 3, channelCount };
}
