import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireLimit,
  assertSameOrigin,
  readLimitedJson,
} from "../src/lib/server/limits";
import { demoDocuments, demoResponse } from "../src/lib/demo";
import { AppError, errorResponse } from "../src/lib/errors";
const { generate, client } = vi.hoisted(() => ({
  generate: vi.fn(),
  client: vi.fn(),
}));
vi.mock("@google/genai", () => ({
  ThinkingLevel: { LOW: "LOW" },
  GoogleGenAI: class {
    models = { generateContent: generate };
    constructor(options: unknown) {
      client(options);
    }
  },
}));
vi.mock("server-only", () => ({}));
import { analyzeDocuments, parseModelResponse } from "../src/lib/server/gemini";
import { POST as analyzeRoute } from "../src/app/api/analyze/route";

describe("Gemini boundary (mock SDK, no quota)", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "synthetic-test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.8-flash");
    generate.mockReset();
    client.mockClear();
  });
  it("uses Generate Content, the configured model and a structured schema", async () => {
    generate.mockResolvedValue({
      text: JSON.stringify(demoResponse),
      candidates: [{ finishReason: "STOP" }],
    });
    const result = await analyzeDocuments(demoDocuments);
    expect(result.mode).toBe("live");
    expect(result.findings.every((f) => f.evidence.status === "verified")).toBe(
      true,
    );
    const request = generate.mock.calls[0][0];
    expect(request.model).toBe("gemini-3.8-flash");
    expect(request.config.responseMimeType).toBe("application/json");
    expect(request.config.responseSchema.type).toBe("OBJECT");
    expect(request.config.automaticContinuation).toBe(false);
    expect(JSON.stringify(request.config.responseSchema)).not.toMatch(
      /minLength|maxLength|maxItems|\$schema/,
    );
    expect(
      request.config.responseSchema.properties.findings.items.properties
        .handoverQuote.nullable,
    ).toBe(true);
    expect(request.config.systemInstruction).toContain("UBETRODD DATA");
    expect(request.contents[0].parts[0].text).toContain(
      '"documentId":"agreement"',
    );
    expect(client.mock.calls[0][0].httpOptions.retryOptions.attempts).toBe(1);
  });
  it("never calls AI or substitutes demo when no key is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(analyzeDocuments(demoDocuments)).rejects.toMatchObject({
      status: 503,
      code: "NOT_CONFIGURED",
    });
    expect(generate).not.toHaveBeenCalled();
  });
  it.each([
    [429, "PROVIDER_RATE_LIMIT"],
    [503, "PROVIDER_UNAVAILABLE"],
    [403, "PROVIDER_AUTH"],
    [404, "PROVIDER_REQUEST"],
    [500, "PROVIDER_ERROR"],
  ])("maps provider status %s to a safe error", async (status, code) => {
    generate.mockRejectedValue({ status, message: "secret-key-provider-body" });
    try {
      await analyzeDocuments(demoDocuments);
      throw new Error("Should fail");
    } catch (error) {
      expect(error).toMatchObject({ code });
      expect((error as Error).message).not.toContain("secret-key");
    }
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("handles timeout, blocked, incomplete and invalid responses", async () => {
    generate.mockRejectedValue(new Error("timeout"));
    await expect(analyzeDocuments(demoDocuments)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    generate.mockResolvedValue({
      candidates: [{ finishReason: "MAX_TOKENS" }],
      text: "{}",
    });
    await expect(analyzeDocuments(demoDocuments)).rejects.toMatchObject({
      code: "INCOMPLETE_RESPONSE",
    });
    expect(() => parseModelResponse(undefined)).toThrow(AppError);
    for (const text of [
      "```json\n{}\n```",
      '{"findings":[{"madeUp":true}]}',
      "{}",
      "not json",
    ])
      expect(() => parseModelResponse(text)).toThrow(AppError);
  });
});
describe("analysis HTTP route with real validation and mocked provider", () => {
  const request = (body: unknown) =>
    new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "http://127.0.0.1:3000",
        host: "127.0.0.1:3000",
      },
      body: JSON.stringify(body),
    });
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "synthetic-test-key");
    generate.mockReset();
  });
  it("passes only the two validated documents to Gemini and returns traceable results", async () => {
    generate.mockResolvedValue({
      text: JSON.stringify(demoResponse),
      candidates: [{ finishReason: "STOP" }],
    });
    const response = await analyzeRoute(
      request({ ...demoDocuments, syntheticOnly: true }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.mode).toBe("live");
    expect(body.result.findings).toHaveLength(7);
    expect(body.result.findings[0].evidence.agreement).toBe("verified");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("returns the actionable missing-key message instead of demo data", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await analyzeRoute(
      request({ ...demoDocuments, syntheticOnly: true }),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("NOT_CONFIGURED");
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects missing consent and swapped document IDs before calling the provider", async () => {
    for (const body of [
      { ...demoDocuments, syntheticOnly: false },
      {
        ...demoDocuments,
        agreement: demoDocuments.handover,
        syntheticOnly: true,
      },
    ]) {
      const response = await analyzeRoute(request(body));
      expect(response.status).toBe(400);
    }
    expect(generate).not.toHaveBeenCalled();
  });
});
describe("request protection", () => {
  it("enforces concurrency, total quota and expiration", () => {
    const release = acquireLimit("test", 2, 100, 1, 0);
    expect(() => acquireLimit("test", 2, 100, 1, 1)).toThrow();
    release();
    release();
    acquireLimit("test", 2, 100, 1, 2)();
    expect(() => acquireLimit("test", 2, 100, 1, 3)).toThrow();
    expect(() => acquireLimit("test", 2, 100, 1, 101)()).not.toThrow();
  });
  it("rejects cross-origin requests", () => {
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost/api/analyze", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost/api/analyze", {
          headers: { origin: "http://localhost" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost:3000/api/analyze", {
          headers: { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost/api/analyze", {
          headers: {
            origin: "https://evil.example",
            host: "localhost",
            "x-forwarded-host": "evil.example",
          },
        }),
      ),
    ).toThrow();
  });
  it("bounds the actual streamed body, not only content-length", async () => {
    const req = (body: string) =>
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    expect(await readLimitedJson(req('{"test":1}'))).toEqual({ test: 1 });
    await expect(
      readLimitedJson(req("x".repeat(100)), 10),
    ).rejects.toMatchObject({ status: 413 });
    await expect(readLimitedJson(req("broken"))).rejects.toMatchObject({
      status: 400,
    });
    expect(
      (await errorResponse(new Error("secret")).json()).error,
    ).not.toContain("secret");
  });
});
