import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDemoAnalysis } from "../src/lib/demo";
import {
  createDemoProposal,
  checkDemoProposal,
} from "../src/lib/proposal-demo";
import {
  canApproveDraft,
  draftDocument,
  reviewSignature,
} from "../src/lib/proposal";
import {
  createReanalysis,
  hasCompleteBaseline,
  isTransferredFollowUp,
  reanalysisInput,
  reanalysisResponseSchema,
} from "../src/lib/reanalysis";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@google/genai", () => ({
  ThinkingLevel: { LOW: "LOW" },
  GoogleGenAI: class {
    models = { generateContent: generate };
  },
}));
vi.mock("server-only", () => ({}));
import { POST } from "../src/app/api/reanalyze/route";
import { reanalyzeCommitments } from "../src/lib/server/reanalysis";

function fixture() {
  const baseline = getDemoAnalysis(false);
  const reviews = Object.fromEntries(
    baseline.findings.map((f) => [
      f.id,
      { decision: "confirmed" as const, comment: "" },
    ]),
  );
  const draft = draftDocument(
    createDemoProposal({ analysis: baseline, reviews, syntheticOnly: true })
      .text,
  );
  const input = reanalysisInput(baseline, draft);
  const response = {
    findings: baseline.findings.map((f) => ({
      findingId: f.id,
      classification: "covered" as const,
      coverageBasis: "agreement_requirement" as const,
      explanation: "Den opprinnelige forpliktelsen er dekket i utkastet.",
      handoverQuote: draft.text.includes(f.sourceQuote)
        ? f.sourceQuote
        : f.handoverQuote,
    })),
  };
  return { baseline, reviews, draft, input, response };
}

describe("fixed commitment baseline", () => {
  it.each([0, 2])("covers an explicit agreement requirement despite an initial confirmation flag: finding %i", index => {
    const { baseline, draft, response } = fixture();
    // Reproduce the live ERP/CSV results: the first model response marked an
    // explicit agreement requirement for confirmation, downgrading its authority.
    Object.assign(baseline.findings[index], {
      informationType: "follow_up",
      requiresConfirmation: true,
      classification: "needs_clarification",
    });
    const before = structuredClone(baseline);
    const check = createReanalysis(reanalysisInput(baseline, draft), response, "live", "mock only");
    expect(check.findings[index]).toMatchObject({
      classification: "covered",
      coverageBasis: "agreement_requirement",
      informationType: "follow_up",
      requiresConfirmation: true,
      evidence: { source: "verified", handover: "verified" },
    });
    expect(isTransferredFollowUp(check.findings[index])).toBe(false);
    expect(hasCompleteBaseline(baseline, check)).toBe(true);
    expect(baseline).toEqual(before);
  });
  it.each(["conflict", "ambiguous", "invalid_source", "invalid_related_source", "invalid_handover", "missing_handover", "insufficient"] as const)("does not accept agreement coverage with %s", scenario => {
    const { baseline, draft, response } = fixture();
    const original = baseline.findings[0];
    Object.assign(original, { informationType: "follow_up", requiresConfirmation: true });
    if (scenario === "conflict") original.informationType = "conflict";
    if (scenario === "ambiguous") original.certainty = "ambiguous";
    if (scenario === "invalid_source") original.sourceQuote = "Et oppdiktet avtalekrav om ERP-integrasjon.";
    if (scenario === "invalid_related_source") original.relatedSources = [{ documentId: "agreement", quote: "Et oppdiktet tilleggssitat fra kundeavtalen." }];
    if (scenario === "invalid_handover") response.findings[0].handoverQuote = "Et oppdiktet sitat fra det oppdaterte notatet.";
    if (scenario === "missing_handover") response.findings[0].handoverQuote = null;
    const check = createReanalysis(reanalysisInput(baseline, draft), {
      findings: response.findings.map((f, i) => i === 0 && scenario === "insufficient"
        ? { ...f, coverageBasis: "insufficient" as const } : f),
    }, "live", "mock only");
    expect(check.findings[0]).toMatchObject({
      classification: "needs_clarification",
      coverageBasis: "insufficient",
      requiresConfirmation: true,
    });
    expect(isTransferredFollowUp(check.findings[0])).toBe(false);
  });
  it("preserves original IDs, metadata, sources and order even when Gemini returns reversed results", () => {
    const { baseline, input, response } = fixture();
    const previous = structuredClone(baseline);
    const check = createReanalysis(
      input,
      { findings: [...response.findings].reverse() },
      "live",
      "test model",
    );
    expect(hasCompleteBaseline(baseline, check)).toBe(true);
    expect(check.baselineId).toBe(baseline.id);
    expect(check.findings.map((f) => f.id)).toEqual(
      baseline.findings.map((f) => f.id),
    );
    check.findings.forEach((f, i) => {
      expect(f.sourceQuote).toBe(baseline.findings[i].sourceQuote);
      expect(f.title).toBe(baseline.findings[i].title);
      expect(f.category).toBe(baseline.findings[i].category);
      expect(f.sources.source).toBe("agreement");
      expect(f.evidence.source).toBe("verified");
    });
    expect(baseline).toEqual(previous);
  });
  it("keeps omitted commitments visible as clarification and blocks approval until every ID is evaluated", () => {
    const { baseline, reviews, draft, input, response } = fixture();
    const missing = baseline.findings[0];
    const partial = createReanalysis(
      input,
      { findings: response.findings.slice(1) },
      "live",
      "test model",
    );
    expect(partial.findings).toHaveLength(baseline.findings.length);
    expect(partial.findings[0]).toMatchObject({
      id: missing.id,
      classification: "needs_clarification",
      evaluationStatus: "not_evaluated",
      sourceQuote: missing.sourceQuote,
      handoverQuote: null,
    });
    const signature = reviewSignature(baseline, reviews);
    expect(
      canApproveDraft(draft.text, signature, signature, partial, baseline),
    ).toBe(false);
    const complete = createReanalysis(input, response, "live", "test model");
    expect(
      canApproveDraft(draft.text, signature, signature, complete, baseline),
    ).toBe(true);
  });
  it("turns a zero-finding response into one blocked clarification per original commitment", () => {
    const { baseline, reviews, draft, input } = fixture();
    const check = createReanalysis(
      input,
      { findings: [] },
      "live",
      "test model",
    );
    expect(check.findings).toHaveLength(7);
    expect(
      check.findings.every(
        (f) =>
          f.evaluationStatus === "not_evaluated" &&
          f.classification === "needs_clarification",
      ),
    ).toBe(true);
    expect(check.findings.map((f) => f.id)).toEqual(
      baseline.findings.map((f) => f.id),
    );
    const signature = reviewSignature(baseline, reviews);
    expect(
      canApproveDraft(draft.text, signature, signature, check, baseline),
    ).toBe(false);
    expect(hasCompleteBaseline(baseline, { ...check, findings: [] })).toBe(
      false,
    );
  });
  it("does not treat duplicate or unknown IDs as evaluated commitments", () => {
    const { baseline, input, response } = fixture();
    const duplicate = createReanalysis(
      input,
      { findings: [response.findings[0], ...response.findings] },
      "live",
      "test model",
    );
    expect(duplicate.findings[0].evaluationStatus).toBe("not_evaluated");
    expect(hasCompleteBaseline(baseline, duplicate)).toBe(false);
    expect(() =>
      createReanalysis(
        input,
        { findings: [{ ...response.findings[0], findingId: "unknown" }] },
        "live",
        "test model",
      ),
    ).toThrow(/ukjent/);
    expect(() =>
      reanalysisInput({ ...baseline, findings: [] }, input.handover),
    ).toThrow();
    expect(() =>
      reanalysisInput(
        { ...baseline, findings: [baseline.findings[0], baseline.findings[0]] },
        input.handover,
      ),
    ).toThrow();
  });
  it("rechecks quotations in the edited document and leaves the original classification traceable", () => {
    const { baseline, input, response } = fixture();
    const check = createReanalysis(
      input,
      {
        findings: [
          {
            ...response.findings[0],
            handoverQuote: "Dette sitatet finnes ikke i utkastet.",
          },
          ...response.findings.slice(1),
        ],
      },
      "live",
      "test model",
    );
    expect(check.findings[0]).toMatchObject({
      modelClassification: "covered",
      classification: "needs_clarification",
      evidence: { handover: "unverified" },
    });
    expect(baseline.findings[0].classification).toBe("potentially_missing");
    expect(
      reanalysisResponseSchema.safeParse({
        findings: [{ ...response.findings[0], evaluationStatus: "evaluated" }],
      }).success,
    ).toBe(false);
    expect(
      hasCompleteBaseline({ ...baseline, id: "another analysis" }, check),
    ).toBe(false);
    expect(
      hasCompleteBaseline(baseline, {
        ...check,
        documents: {
          ...check.documents,
          agreement: {
            ...check.documents.agreement,
            text: "En helt annen syntetisk kundeavtale.",
          },
        },
      }),
    ).toBe(false);
  });
  it("keeps the same IDs and complete coverage in the rule-based demo without an SDK call", () => {
    const { baseline, draft } = fixture();
    generate.mockClear();
    const check = checkDemoProposal(baseline, draft);
    expect(check.mode).toBe("demo");
    expect(hasCompleteBaseline(baseline, check)).toBe(true);
    expect(check.findings.every((f) => f.classification === "covered")).toBe(
      true,
    );
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("reanalysis server boundary", () => {
  beforeEach(() => {
    generate.mockReset();
    vi.stubEnv("GEMINI_API_KEY", "synthetic-test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
  });
  const request = (body: unknown, origin = "http://localhost") =>
    new Request("http://localhost/api/reanalyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify(body),
    });
  it("sends the fixed IDs and current draft to Gemini and reconciles the returned subset", async () => {
    const { baseline, draft, input, response } = fixture();
    generate.mockResolvedValue({
      text: JSON.stringify({ findings: response.findings.slice(1) }),
    });
    const reply = await POST(request(input));
    expect(reply.status).toBe(200);
    expect(reply.headers.get("cache-control")).toBe("no-store");
    const { result } = await reply.json();
    expect(result.findings).toHaveLength(baseline.findings.length);
    expect(result.findings[0].evaluationStatus).toBe("not_evaluated");
    const sent = generate.mock.calls[0][0];
    const context = JSON.parse(sent.contents[0].parts[0].text);
    expect(
      context.commitments.map((f: { findingId: string }) => f.findingId),
    ).toEqual(baseline.findings.map((f) => f.id));
    expect(context.documents).toEqual([
      {
        documentId: "agreement",
        documentType: "agreement",
        text: baseline.documents.agreement.text,
      },
      {
        documentId: "updated_handover",
        documentType: "handover",
        text: draft.text,
      },
    ]);
    expect(sent.config.systemInstruction).toContain("FAST kontrollgrunnlag");
    expect(sent.config.systemInstruction).toContain("UBETRODD DATA");
  });
  it("handles a valid empty live response without hiding the baseline", async () => {
    const { input } = fixture();
    generate.mockResolvedValue({ text: '{"findings":[]}' });
    const reply = await POST(request(input));
    expect(reply.status).toBe(200);
    const { result } = await reply.json();
    expect(result.findings).toHaveLength(7);
    expect(
      result.findings.every(
        (f: { evaluationStatus: string }) =>
          f.evaluationStatus === "not_evaluated",
      ),
    ).toBe(true);
  });
  it("rejects invalid input and foreign origins before contacting the provider", async () => {
    const { input } = fixture();
    expect(
      (await POST(request({ ...input, syntheticOnly: false }))).status,
    ).toBe(400);
    expect((await POST(request(input, "https://other.example"))).status).toBe(
      403,
    );
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects malformed or unrelated provider responses rather than using demo data", async () => {
    const { input, response } = fixture();
    generate.mockResolvedValue({
      text: JSON.stringify({
        findings: [{ ...response.findings[0], findingId: "unknown" }],
      }),
    });
    await expect(reanalyzeCommitments(input)).rejects.toMatchObject({
      code: "INVALID_REANALYSIS",
    });
    generate.mockResolvedValue({ text: '{"findings":[{"findingId":"bad"}]}' });
    await expect(reanalyzeCommitments(input)).rejects.toMatchObject({
      code: "INVALID_AI_RESPONSE",
    });
  });
});
