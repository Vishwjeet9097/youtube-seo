import { z } from "zod";
import type { ApiEnvelope } from "@/types/research";

const envelopeBaseSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().nullable(),
  meta: z.object({
    source: z.string(),
    retrievedAt: z.string(),
    cached: z.boolean().nullable(),
    cacheAgeSeconds: z.number().nullable(),
    sampleSize: z.number().nullable(),
    region: z.string().nullable(),
    language: z.string().nullable(),
    warnings: z.array(z.string()),
  }),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    details: z.record(z.string(), z.array(z.string())).optional(),
  }).nullable(),
});

export class ClientApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

type ApiSuccess<T> = Extract<ApiEnvelope<T>, { ok: true }>;

export async function postApi<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<ApiSuccess<T>> {
  if (!path.startsWith("/api/")) throw new ClientApiError("INVALID_API_PATH", "This request could not be sent.", false, 400);
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const unknownPayload: unknown = await response.json().catch(() => null);
  const parsed = envelopeBaseSchema.safeParse(unknownPayload);
  if (!parsed.success) throw new ClientApiError("INVALID_API_RESPONSE", "The server returned a response this app couldn't read. Try again.", true, response.status);
  const envelope = parsed.data as ApiEnvelope<T>;
  if (!envelope.ok) throw new ClientApiError(envelope.error.code, envelope.error.message, envelope.error.retryable, response.status);
  return envelope;
}

export async function getApi<T>(path: string, signal?: AbortSignal): Promise<ApiSuccess<T>> {
  if (!path.startsWith("/api/")) throw new ClientApiError("INVALID_API_PATH", "This request could not be sent.", false, 400);
  const response = await fetch(path, { signal, headers: { accept: "application/json" } });
  const unknownPayload: unknown = await response.json().catch(() => null);
  const parsed = envelopeBaseSchema.safeParse(unknownPayload);
  if (!parsed.success) throw new ClientApiError("INVALID_API_RESPONSE", "The server returned a response this app couldn't read. Try again.", true, response.status);
  const envelope = parsed.data as ApiEnvelope<T>;
  if (!envelope.ok) throw new ClientApiError(envelope.error.code, envelope.error.message, envelope.error.retryable, response.status);
  return envelope;
}
