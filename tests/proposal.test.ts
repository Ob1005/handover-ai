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
import { canGenerateProposal, updateReview, reviewProgress, getWorkflowStep } from "../src/lib/review";
import { reanalysisInput } from "../src/lib/reanalysis";

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

function input(includeSupporting = false): ProposalRequest {
  const analysis = getDemoAnalysis(includeSupporting);
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
  it("includes summary-only follow-ups in the standalone draft without mutating the model response", () => {
    const data = input(true);
    const teams = "Kunden ønsker digitalt oppstartsmøte på Teams. Møteformen må bekreftes.";
    const content = {
      text: data.analysis.documents.handover.text,
      changes: [],
      followUps: [teams, teams],
    };
    const before = structuredClone(content);
    const proposal = createProposal(content, data, "live", "mock only");
    expect(proposal.text).toContain("ÅPNE PUNKTER FOR OPPFØLGING\n- " + teams);
    expect(proposal.text.split(teams)).toHaveLength(2);
    expect(reanalysisInput(data.analysis, draftDocument(proposal.text)).handover.text)
      .toContain(teams);
    expect(content).toEqual(before);
  });
  it("does not repeat follow-ups already included in the note, including whitespace differences", () => {
    const data = input();
    const followUp = "Bekreft om oppstartsmøtet skal holdes digitalt på Teams.";
    const text = data.analysis.documents.handover.text + "\n\n" + followUp.replaceAll(" ", "\n");
    const proposal = createProposal({ text, changes: [], followUps: [followUp] }, data, "live", "mock only");
    expect(proposal.text).toBe(text);
  });
  it.each(["document", "combined"] as const)("rejects follow-up additions that exceed the %s text limit rather than dropping them", limit => {
    const data = input();
    const maxDraftCharacters = limit === "document" ? 20_000 : 30;
    if (limit === "combined") {
      data.analysis.documents.agreement.text = "a".repeat(20_000);
      data.analysis.documents.handover.text = "x".repeat(30);
      data.analysis.documents.correspondence = {
        ...data.analysis.documents.agreement,
        id: "correspondence",
        documentType: "correspondence",
        text: "b".repeat(19_970),
      };
    }
    expect(proposalRequestSchema.safeParse(data).success).toBe(true);
    expect(proposalContext(data).maxDraftCharacters).toBe(maxDraftCharacters);
    expect(() => createProposal({
      text: "x".repeat(maxDraftCharacters),
      changes: [],
      followUps: ["Bekreft om oppstartsmøtet skal holdes digitalt på Teams."],
    }, data, "live", "mock only")).toThrow();
  });
  it("allows the demo to continue with only actionable findings reviewed and keeps all baseline findings", () => {
    const data = input();
    const covered = data.analysis.findings.filter(f => f.classification === "covered");
    for (const f of covered) delete data.reviews[f.id];
    expect(proposalRequestSchema.safeParse(data).success).toBe(true);
    expect(reviewProgress(data.analysis.findings, data.reviews)).toEqual({ reviewed: 3, unresolved: 0, total: 3 });
    expect(getWorkflowStep(data.analysis.documents, null, data.analysis, data.reviews)).toBe(4);
    const context = proposalContext(data);
    expect(context.findings).toHaveLength(7);
    expect(context.findings.find(f => f.id === covered[0].id)?.review.decision).toBe("unreviewed");
    const proposal = createDemoProposal(data);
    const check = checkDemoProposal(data.analysis, draftDocument(proposal.text));
    expect(check.findings.map(f => f.id)).toEqual(data.analysis.findings.map(f => f.id));
    const optional = updateReview(data.reviews, covered[0].id, { decision: "rejected", comment: "Kontroller formuleringen" });
    expect(reviewProgress(data.analysis.findings, optional).unresolved).toBe(0);
  });
  it("allows an all-covered analysis without manufacturing human confirmations", () => {
    const data = input();
    data.analysis.findings = data.analysis.findings.filter(f => f.classification === "covered");
    data.reviews = {};
    expect(proposalRequestSchema.safeParse(data).success).toBe(true);
    expect(canGenerateProposal(data.analysis, data.reviews)).toBe(true);
    expect(reviewProgress(data.analysis.findings, {})).toEqual({ reviewed: 0, unresolved: 0, total: 0 });
    expect(() => createDemoProposal(data)).not.toThrow();
    expect(data.reviews).toEqual({});
  });
  it("does not treat an empty initial analysis as ready for a proposal", () => {
    const data = input();
    data.analysis.findings = [];
    data.reviews = {};
    expect(canGenerateProposal(data.analysis, data.reviews)).toBe(false);
    expect(proposalRequestSchema.safeParse(data).success).toBe(false);
    expect(() => proposalContext(data)).toThrow(/Analysen må inneholde funn/);
    expect(() => createDemoProposal(data)).toThrow(/Analysen må inneholde funn/);
    expect(getWorkflowStep(data.analysis.documents, null, data.analysis, {})).toBe(3);
  });
  it.each(["potentially_missing", "needs_clarification"] as const)("blocks an unreviewed %s finding", classification => {
    const data = input();
    const required = data.analysis.findings.find(f => f.classification === classification)!;
    delete data.reviews[required.id];
    expect(proposalRequestSchema.safeParse(data).success).toBe(false);
    expect(getWorkflowStep(data.analysis.documents, null, data.analysis, data.reviews)).toBe(3);
  });

  it("requires actionable findings to be reviewed and rejects unrelated or duplicate IDs", () => {
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
    data.analysis.findings[0].sourceQuote =
      "This quotation does not exist in the agreement.";
    expect(data.analysis.findings[0].evidence.source).toBe("verified");
    expect(proposalContext(data).findings[0].sourceQuoteVerified).toBe(false);
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
    const check = checkDemoProposal(
      data.analysis,
      draftDocument(proposal.text),
    );
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
    expect(proposal.text).not.toContain(first.sourceQuote);
    expect(proposal.followUps.join(" ")).toContain(
      data.reviews[first.id].comment,
    );
    const check = checkDemoProposal(
      data.analysis,
      draftDocument(proposal.text),
    );
    expect(
      check.findings.find((f) => f.category === "integrations")?.classification,
    ).toBe("potentially_missing");
  });
  it("keeps unverified commitments out of automatic demo corrections", () => {
    const data = input();
    data.analysis.findings[0].sourceQuote =
      "An invented ERP commitment that was never agreed.";
    const proposal = createDemoProposal(data);
    expect(proposal.text).not.toContain(data.analysis.findings[0].sourceQuote);
    expect(proposal.followUps.join(" ")).toContain("Avklar");
  });
});
describe("approval is tied to the checked version and reviewer decisions", () => {
  it("requires a fresh check and invalidates approval after edits or changed comments", () => {
    const data = input();
    const proposal = createDemoProposal(data);
    const check = checkDemoProposal(
      data.analysis,
      draftDocument(proposal.text),
    );
    const signature = reviewSignature(data.analysis, data.reviews);
    expect(
      canApproveDraft(proposal.text, signature, signature, null, data.analysis),
    ).toBe(false);
    expect(
      canApproveDraft(
        proposal.text,
        signature,
        signature,
        check,
        data.analysis,
      ),
    ).toBe(true);
    expect(
      canApproveDraft(
        proposal.text + "\nEndret innhold.",
        signature,
        signature,
        check,
        data.analysis,
      ),
    ).toBe(false);
    expect(
      canApproveDraft(
        proposal.text,
        signature,
        signature,
        check,
        data.analysis,
        true,
      ),
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
        data.analysis,
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
  it("returns a complete draft when Gemini puts the Teams question only in followUps", async () => {
    const data = input(true);
    const followUp = "Bekreft om oppstartsmøtet skal holdes digitalt på Teams slik kunden ønsker.";
    generate.mockResolvedValue({ text: JSON.stringify({
      updates: [],
      followUps: [followUp],
    }) });
    const response = await POST(request(data));
    expect(response.status).toBe(200);
    const { proposal } = await response.json();
    expect(proposal.text).toContain(followUp);
    expect(proposal.followUps).toEqual([followUp]);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("passes decisions and comments as data and accepts unreviewed covered findings", async () => {
    const data = input();
    for (const f of data.analysis.findings.filter(f => f.classification === "covered")) delete data.reviews[f.id];
    data.reviews[data.analysis.findings[0].id].comment =
      "Kontroller hvem som eier integrasjonen.";
    generate.mockResolvedValue({
      text: JSON.stringify({
        updates: [],
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
    expect(sent.config.responseSchema.properties.updates.type).toBe("ARRAY");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("does not call the provider until all decisions are made", async () => {
    const data = input();
    data.reviews[data.analysis.findings[0].id].decision = "unreviewed";
    const response = await POST(request(data));
    expect(response.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects an empty initial analysis before making an API call", async () => {
    const data = input();
    data.analysis.findings = [];
    data.reviews = {};
    const response = await POST(request(data));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "NO_FINDINGS",
      error: expect.stringContaining("Kontroller dokumentene"),
    });
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
        updates: [
          { findingId: first.id, text: "Incorporate rejected finding.", summary: "Incorporate rejected finding." },
        ],
        followUps: [],
      }),
    });
    await expect(generateProposal(data)).rejects.toMatchObject({
      code: "INVALID_PROPOSAL",
    });
  });
});
