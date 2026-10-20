import { AppError } from "../errors";

// Intentionally process-wide: no trusting spoofable forwarded IP headers in a local prototype.
const buckets = new Map<
  string,
  { count: number; reset: number; active: number }
>();
export function acquireLimit(
  key: string,
  limit: number,
  windowMs: number,
  maxActive: number,
  now = Date.now(),
) {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { count: 0, reset: now + windowMs, active: 0 };
    buckets.set(key, bucket);
  }
  if (now >= bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + windowMs;
  }
  if (bucket.count >= limit || bucket.active >= maxActive)
    throw new AppError(
      "For mange forespørsler. Vent litt før du prøver igjen.",
      429,
      "RATE_LIMIT",
    );
  bucket.count++;
  bucket.active++;
  let released = false;
  return () => {
    if (!released) {
      bucket.active--;
      released = true;
    }
  };
}
export async function readLimitedJson(
  request: Request,
  maxBytes = 100_000,
): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("Forespørselen må bruke JSON.", 415);
  const buffer = await readLimitedBody(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new AppError("Ugyldig JSON i forespørselen.");
  }
}
export async function readLimitedBody(request: Request, maxBytes: number) {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new AppError("Forespørselen er for stor.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Forespørselen mangler innhold.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AppError("Forespørselen er for stor.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Next can use localhost internally even when the browser opens 127.0.0.1.
  // Compare the browser Origin with the actual Host, never untrusted forwarded headers.
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host") ?? requestUrl.host;
  if (origin) {
    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      throw new AppError("Ugyldig opprinnelse.", 403);
    }
    if (originUrl.host !== host || originUrl.protocol !== requestUrl.protocol)
      throw new AppError(
        "Forespørselen må komme fra denne applikasjonen.",
        403,
      );
  }
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError("Eksterne forespørsler er ikke tillatt.", 403);
}
