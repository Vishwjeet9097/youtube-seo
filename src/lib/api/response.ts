import { ZodError, type ZodType } from "zod";
import { AppError, publicError } from "@/lib/api/errors";
import { apiRateLimiter, requestIdentity } from "@/lib/api/rate-limit";
import type { ApiEnvelope, ApiMeta } from "@/types/research";

const MAX_BODY_BYTES = 64 * 1024;

export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const contentType = request.headers.get("content-type")?.toLocaleLowerCase() ?? "";
  if (!contentType.includes("application/json")) throw new AppError("UNSUPPORTED_MEDIA_TYPE", "This request format isn't supported. Send JSON and try again.", 415, false);
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  const body: unknown = JSON.parse(raw);
  return schema.parse(body);
}

export function enforceRateLimit(request: Request, cost = 1): void { apiRateLimiter.check(requestIdentity(request), Date.now(), cost); }

export function enforceSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestOrigin = new URL(request.url).origin;
  const configured = (process.env.ALLOWED_APP_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (origin !== requestOrigin && !configured.includes(origin)) throw new AppError("ORIGIN_NOT_ALLOWED", "This site can't send requests here. Open the app from an approved address and try again.", 403, false);
}

export function successResponse<T>(data: T, meta: Partial<ApiMeta> = {}, status = 200): Response {
  const retrievedAt = meta.retrievedAt ?? new Date().toISOString();
  const envelope: ApiEnvelope<T> = { ok: true, data, error: null, meta: { source: meta.source ?? "SourceLens", retrievedAt, cached: meta.cached ?? null, cacheAgeSeconds: meta.cacheAgeSeconds ?? null, sampleSize: meta.sampleSize ?? null, region: meta.region ?? null, language: meta.language ?? null, warnings: meta.warnings ?? [] } };
  return Response.json(envelope, { status, headers: securityHeaders() });
}

export function errorResponse(error: unknown, meta: Partial<ApiMeta> = {}): Response {
  if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") return failure("REQUEST_TOO_LARGE", "This request is too large. Shorten it and try again.", 413, false, meta);
  if (error instanceof ZodError) {
    const flattened = error.flatten();
    return failure("VALIDATION_ERROR", "Check your entries and try again.", 400, false, meta, flattened.fieldErrors as Record<string, string[]>);
  }
  const safe = publicError(error);
  return failure(safe.code, safe.message, safe.status, safe.retryable, meta, safe.details);
}

function failure(code: string, message: string, status: number, retryable: boolean, meta: Partial<ApiMeta>, details?: Record<string, string[]>): Response {
  const envelope: ApiEnvelope<never> = { ok: false, data: null, error: { code, message, retryable, ...(details ? { details } : {}) }, meta: { source: meta.source ?? "SourceLens", retrievedAt: meta.retrievedAt ?? new Date().toISOString(), cached: null, cacheAgeSeconds: null, sampleSize: null, region: meta.region ?? null, language: meta.language ?? null, warnings: meta.warnings ?? [] } };
  const headers = securityHeaders();
  if (status === 429) headers["retry-after"] = "60";
  return Response.json(envelope, { status, headers });
}

function securityHeaders(): Record<string, string> {
  return { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" };
}
