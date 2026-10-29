import { z } from "zod";
import { AppError } from "@/lib/api/errors";

const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://www.googleapis.com",
  "https://suggestqueries-clients6.youtube.com",
  "https://suggestqueries.google.com",
]);

interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  allowedOrigins?: ReadonlySet<string>;
}

function boundedTimeout(value: number | undefined): number {
  const environmentValue = Number.parseInt(process.env.EXTERNAL_REQUEST_TIMEOUT_MS ?? "8000", 10);
  const requested = value ?? (Number.isFinite(environmentValue) ? environmentValue : 8000);
  return Math.min(20_000, Math.max(1_000, requested));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchValidatedJson<T>(
  url: URL,
  schema: z.ZodType<T>,
  init: RequestInit = {},
  options: FetchJsonOptions = {},
): Promise<T> {
  const allowedOrigins = options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;
  if (url.protocol !== "https:" || !allowedOrigins.has(url.origin) || url.username || url.password || url.port) {
    throw new AppError("OUTBOUND_URL_BLOCKED", "The data source is not set up correctly. Contact the app administrator.", 500, false);
  }
  const retries = Math.min(2, Math.max(0, options.retries ?? 2));
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), boundedTimeout(options.timeoutMs));
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "YouTubeEvidenceLab/1.0",
          ...init.headers,
        },
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const providerReason = extractProviderReason(payload);
        const retryable = response.status === 429 || response.status >= 500;
        const code = providerReason === "quotaExceeded" || providerReason === "dailyLimitExceeded"
          ? "YOUTUBE_QUOTA_EXCEEDED"
          : response.status === 429
            ? "PROVIDER_RATE_LIMITED"
            : response.status === 403
              ? "PROVIDER_FORBIDDEN"
              : "PROVIDER_ERROR";
        throw new AppError(
          code,
          code === "YOUTUBE_QUOTA_EXCEEDED"
            ? "YouTube’s daily request limit has been reached. Try again after it resets, or contact the app administrator."
            : `The data source could not complete the request (status ${response.status}). ${retryable ? "Try again." : "Contact the app administrator."}`,
          code === "YOUTUBE_QUOTA_EXCEEDED" ? 429 : response.status,
          retryable && code !== "YOUTUBE_QUOTA_EXCEEDED",
        );
      }
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new AppError("INVALID_PROVIDER_RESPONSE", "The data source returned information the app could not read. Contact the app administrator.", 502, false);
      }
      return parsed.data;
    } catch (error) {
      lastError = error;
      const appError = error instanceof AppError ? error : null;
      const isAbort = error instanceof Error && error.name === "AbortError";
      const retryable = isAbort || appError?.retryable || error instanceof TypeError;
      if (!retryable || attempt === retries) {
        if (isAbort) throw new AppError("PROVIDER_TIMEOUT", "The data source took too long to respond. Try again.", 504, true);
        if (appError) throw appError;
        throw new AppError("PROVIDER_UNAVAILABLE", "The data source is unavailable right now. Try again.", 503, true);
      }
      await delay(200 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function extractProviderReason(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const errors = (error as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return null;
  const first = errors[0];
  return first && typeof first === "object" && typeof (first as { reason?: unknown }).reason === "string"
    ? (first as { reason: string }).reason
    : null;
}
