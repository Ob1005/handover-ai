import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDemoAnalysis } from "../src/lib/demo";
import {
  canApproveDraft,
  createProposal,
  draftDocument,
  proposalContext,
  proposalRequestSchema,
  reviewSignature,
  type ProposalRequest,
} from "../src/lib/proposal";
import {
  createDemoProposal,
  checkDemoProposal,
} from "../src/lib/proposal-demo";
import { updateReview } from "../src/lib/review";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@google/genai", () => ({
  ThinkingLevel: { LOW: "LOW" },
  GoogleGenAI: class {
    models = { generateContent: generate };
  },
}));
vi.mock("server-only", () => ({}));
import { POST } from "../src/app/api/proposal/route";
import { generateProposal } from "../src/lib/server/proposal";

function input(): ProposalRequest {
  const analysis = getDemoAnalysis();
  return {
    analysis,
    reviews: Object.fromEntries(
      analysis.findings.map((f) => [
        f.id,
        { decision: "confirmed" as const, comment: "" },
      ]),
    ),
    syntheticOnly: true,
  };
}
describe("proposal input, source handling and decisions", () => {
  it("requires every finding to be reviewed and rejects unrelated or duplicate IDs", () => {
    const data = input();
    expect(proposalRequestSchema.safeParse(data).success).toBe(true);
    expect(
      proposalRequestSchema.safeParse({ ...data, reviews: {} }).success,
    ).toBe(false);
    expect(
      proposalRequestSchema.safeParse({
        ...data,
        reviews: {
          ...data.reviews,
          unknown: { decision: "confirmed", comment: "" },
        },
      }).success,
    ).toBe(false);
    expect(
      proposalRequestSchema.safeParse({
        ...data,
        analysis: {
          ...data.analysis,
          findings: [data.analysis.findings[0], data.analysis.findings[0]],
        },
      }).success,
    ).toBe(false);
    expect(
      proposalRequestSchema.safeParse({ ...data, syntheticOnly: false })
        .success,
    ).toBe(false);
  });
  it("recalculates source verification instead of trusting browser flags", () => {
    const data = input();
    data.analysis.findings[0].agreementQuote =
      "This quotation does not exist in the agreement.";
    expect(data.analysis.findings[0].evidence.agreement).toBe("verified");
    expect(proposalContext(data).findings[0].agreementQuoteVerified).toBe(
      false,
    );
  });
  it("rejects generated changes attributed to rejected or unknown findings", () => {
    const data = input();
    const first = data.analysis.findings[0];
    data.reviews[first.id].decision = "rejected";
    const content = {
      text: data.analysis.documents.handover.text,
      changes: [
        { findingId: first.id, summary: "A proposed integration change." },
      ],
      followUps: [],
    };
    expect(() => createProposal(content, data, "live", "test model")).toThrow(
      /avvist/,
    );
    expect(() =>
      createProposal(
        {
          ...content,
          changes: [{ ...content.changes[0], findingId: "unknown" }],
        },
        data,
        "live",
        "test model",
      ),
    ).toThrow();
  });
});
describe("transparent, review-sensitive demo", () => {
  it("updates confirmed omissions and conflicting dates and verifies the resulting draft", () => {
    const data = input();
    const original = data.analysis.documents.agreement.text;
    const proposal = createDemoProposal(data);
    expect(proposal.mode).toBe("demo");
    expect(proposal.changes).toHaveLength(3);
    expect(proposal.text).toContain("Visma Business");
    expect(proposal.text).toContain("senest 1. desember 2026");
    expect(proposal.text).not.toContain("15. desember 2026");
    expect(data.analysis.documents.agreement.text).toBe(original);
    const check = checkDemoProposal({
      agreement: data.analysis.documents.agreement,
      handover: { ...draftDocument(proposal.text), id: "handover" },
    });
    expect(check.findings).toHaveLength(7);
    expect(
      check.findings.every(
        (f) =>
          f.classification === "covered" && f.evidence.status === "verified",
      ),
    ).toBe(true);
  });
  it("leaves rejected omissions unchanged and carries reviewer comments as notes", () => {
    const data = input();
    const first = data.analysis.findings[0];
    data.reviews[first.id] = {
      decision: "rejected",
      comment: "Avklar integrasjonen separat med salg.",
    };
    const proposal = createDemoProposal(data);
    expect(proposal.changes.some((c) => c.findingId === first.id)).toBe(false);
    expect(proposal.text).not.toContain(first.agreementQuote);
    expect(proposal.followUps.join(" ")).toContain(
      data.reviews[first.id].comment,
    );
    const check = checkDemoProposal({
      agreement: data.analysis.documents.agreement,
      handover: { ...draftDocument(proposal.text), id: "handover" },
    });
    expect(
      check.findings.find((f) => f.category === "integrations")?.classification,
    ).toBe("potentially_missing");
  });
  it("keeps unverified commitments out of automatic demo corrections", () => {
    const data = input();
    data.analysis.findings[0].agreementQuote =
      "An invented ERP commitment that was never agreed.";
    const proposal = createDemoProposal(data);
    expect(proposal.text).not.toContain(
      data.analysis.findings[0].agreementQuote,
    );
    expect(proposal.followUps.join(" ")).toContain("Avklar");
  });
});
describe("approval is tied to the checked version and reviewer decisions", () => {
  it("requires a fresh check and invalidates approval after edits or changed comments", () => {
    const data = input();
    const proposal = createDemoProposal(data);
    const check = checkDemoProposal({
      agreement: data.analysis.documents.agreement,
      handover: { ...draftDocument(proposal.text), id: "handover" },
    });
    const signature = reviewSignature(data.analysis, data.reviews);
    expect(canApproveDraft(proposal.text, signature, signature, null)).toBe(
      false,
    );
    expect(canApproveDraft(proposal.text, signature, signature, check)).toBe(
      true,
    );
    expect(
      canApproveDraft(
        proposal.text + "\nEndret innhold.",
        signature,
        signature,
        check,
      ),
    ).toBe(false);
    expect(
      canApproveDraft(proposal.text, signature, signature, check, true),
    ).toBe(false);
    const changed = updateReview(data.reviews, data.analysis.findings[0].id, {
      comment: "En ny vurdering.",
    });
    expect(
      canApproveDraft(
        proposal.text,
        signature,
        reviewSignature(data.analysis, changed),
        check,
      ),
    ).toBe(false);
    expect(() => draftDocument("kort")).toThrow();
    expect(() => draftDocument("a".repeat(20001))).toThrow();
  });
});
describe("proposal HTTP route and live SDK boundary (mocked)", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "synthetic-test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    generate.mockReset();
  });
  const request = (body: unknown) =>
    new Request("http://localhost/api/proposal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "http://localhost",
      },
      body: JSON.stringify(body),
    });
  it("passes decisions and comments as data and returns a validated live proposal", async () => {
    const data = input();
    data.reviews[data.analysis.findings[0].id].comment =
      "Kontroller hvem som eier integrasjonen.";
    generate.mockResolvedValue({
      text: JSON.stringify({
        text: data.analysis.documents.handover.text,
        changes: [],
        followUps: [],
      }),
      candidates: [{ finishReason: "STOP" }],
    });
    const response = await POST(request(data));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.proposal.mode).toBe("live");
    expect(body.proposal.model).toBe("gemini-3.5-flash-lite");
    const sent = generate.mock.calls[0][0];
    const context = JSON.parse(sent.contents[0].parts[0].text);
    expect(context.findings[0].review.comment).toBe(
      data.reviews[data.analysis.findings[0].id].comment,
    );
    expect(sent.config.systemInstruction).toContain("UBETRODD DATA");
    expect(sent.config.responseSchema.properties.text.type).toBe("STRING");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("does not call the provider until all decisions are made", async () => {
    const data = input();
    data.reviews[data.analysis.findings[0].id].decision = "unreviewed";
    const response = await POST(request(data));
    expect(response.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects invalid model output and never replaces it with demo data", async () => {
    generate.mockResolvedValue({ text: '{"text":"Too short"}' });
    await expect(generateProposal(input())).rejects.toMatchObject({
      code: "INVALID_AI_RESPONSE",
    });
    const data = input();
    const first = data.analysis.findings[0];
    data.reviews[first.id].decision = "rejected";
    generate.mockResolvedValue({
      text: JSON.stringify({
        text: data.analysis.documents.handover.text,
        changes: [
          { findingId: first.id, summary: "Incorporate rejected finding." },
        ],
        followUps: [],
      }),
    });
    await expect(generateProposal(data)).rejects.toMatchObject({
      code: "INVALID_PROPOSAL",
    });
  });
});
