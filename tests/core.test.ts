import { describe, expect, it } from "vitest";
import {
  aiResponseSchema,
  documentsSchema,
  MAX_FILE_BYTES,
  MAX_TEXT_LENGTH,
} from "../src/lib/schemas";
import {
  validateExtractedText,
  validateFile,
} from "../src/lib/file-validation";
import {
  createAnalysis,
  quoteExists,
  validateFindings,
} from "../src/lib/evidence";
import { demoDocuments, demoResponse, getDemoAnalysis } from "../src/lib/demo";
import {
  getWorkflowStep,
  parseSession,
  reviewProgress,
  serializeSession,
  updateReview,
} from "../src/lib/review";
import { dataset } from "../evaluation/dataset";
import { scoreCase } from "../evaluation/score";

describe("file and content boundaries", () => {
  it.each(["avtale.pdf", "AVTALE.PDF", "notat.txt"])("accepts %s", (name) =>
    expect(validateFile({ name, size: 100, type: "" })).toMatch(/pdf|txt/),
  );
  it.each([
    { name: "avtale.docx", size: 100, type: "" },
    { name: "fake.pdf", size: 100, type: "text/html" },
    { name: "empty.txt", size: 0, type: "" },
    { name: "large.pdf", size: MAX_FILE_BYTES + 1, type: "" },
    { name: "x".repeat(181) + ".txt", size: 10, type: "" },
  ])("rejects invalid files %#", (file) =>
    expect(() => validateFile(file)).toThrow(),
  );
  it("rejects empty, scanned, excessive and binary text", () => {
    for (const text of [
      "",
      "  ",
      "kort",
      "a".repeat(MAX_TEXT_LENGTH + 1),
      "binary\x01".repeat(10),
    ])
      expect(() => validateExtractedText(text)).toThrow();
    expect(
      validateExtractedText("  En tilstrekkelig lang avtaletekst.  "),
    ).toBe("En tilstrekkelig lang avtaletekst.");
  });
  it("validates server document roles and size again", () => {
    expect(
      documentsSchema.safeParse({
        ...demoDocuments,
        agreement: { ...demoDocuments.agreement, id: "handover" },
      }).success,
    ).toBe(false);
    expect(
      documentsSchema.safeParse({
        ...demoDocuments,
        handover: {
          ...demoDocuments.handover,
          text: "a".repeat(MAX_TEXT_LENGTH + 1),
        },
      }).success,
    ).toBe(false);
  });
});
describe("AI schema and evidence", () => {
  it("validates demo without allowing model-owned verification or reviews", () => {
    expect(aiResponseSchema.safeParse(demoResponse).success).toBe(true);
    expect(
      aiResponseSchema.safeParse({
        findings: Array.from({ length: 41 }, () => demoResponse.findings[0]),
      }).success,
    ).toBe(false);
    for (const field of [
      { evidence: { status: "verified" } },
      { id: "trusted" },
      { review: "confirmed" },
      { classification: "approved" },
    ])
      expect(
        aiResponseSchema.safeParse({
          findings: [{ ...demoResponse.findings[0], ...field }],
        }).success,
      ).toBe(false);
  });
  it("requires exact case-sensitive quotes with only whitespace and Unicode normalization", () => {
    expect(quoteExists("fem nøkkelbrukere", "fem\n\t nøkkelbrukere")).toBe(
      true,
    );
    expect(quoteExists("café", "cafe\u0301")).toBe(true);
    expect(quoteExists("Fem brukere", "fem brukere")).toBe(false);
    expect(quoteExists("1. desember", "15. desember")).toBe(false);
    expect(quoteExists("ERP er inkludert", "ERP er ikke inkludert")).toBe(
      false,
    );
    expect(quoteExists("", "Tekst")).toBe(false);
    expect(quoteExists(null, "Tekst")).toBe(false);
  });
  it("verifies every supplied demo quote and retains classifications", () => {
    const findings = validateFindings(demoResponse, demoDocuments);
    expect(findings).toHaveLength(7);
    expect(findings.every((f) => f.evidence.status === "verified")).toBe(true);
    expect(findings.map((f) => f.classification)).toEqual(
      demoResponse.findings.map((f) => f.classification),
    );
    expect(
      findings.filter((f) => f.classification === "potentially_missing"),
    ).toHaveLength(2);
    expect(findings[0].evidence.handover).toBe("not_provided");
  });
  it.each([
    { sourceQuote: "This is a fabricated source quotation." },
    { handoverQuote: "A fabricated handover statement." },
    { certainty: "ambiguous" as const },
    { classification: "covered" as const, handoverQuote: null },
  ])("routes unsafe interpretations to clarification %#", (patch) => {
    const finding = validateFindings(
      { findings: [{ ...demoResponse.findings[0], ...patch }] },
      demoDocuments,
    )[0];
    expect(finding.classification).toBe("needs_clarification");
  });
  it("produces stable finding IDs and consolidates exact duplicate findings", () => {
    expect(getDemoAnalysis(false).findings.map((f) => f.id)).toEqual(
      getDemoAnalysis(false).findings.map((f) => f.id),
    );
    expect(
      validateFindings(
        { findings: [demoResponse.findings[0], demoResponse.findings[0]] },
        demoDocuments,
      ),
    ).toHaveLength(1);
  });
});
describe("human review and browser session", () => {
  it("waits for every review before opening proposal generation", () => {
    const result = { ...getDemoAnalysis(false), mode: "live" as const };
    expect(getWorkflowStep(demoDocuments, "analysis", null, {})).toBe(2);
    expect(getWorkflowStep(demoDocuments, null, result, {})).toBe(3);
    const reviewed = Object.fromEntries(
      result.findings.map((f) => [
        f.id,
        { decision: "confirmed" as const, comment: "" },
      ]),
    );
    expect(getWorkflowStep(demoDocuments, null, result, reviewed)).toBe(4);
    expect(
      getWorkflowStep(
        demoDocuments,
        null,
        result,
        updateReview(reviewed, result.findings[0].id, {
          decision: "unreviewed",
        }),
      ),
    ).toBe(3);
    expect(getWorkflowStep(demoDocuments, "generation", result, reviewed)).toBe(
      4,
    );
    expect(
      getWorkflowStep(demoDocuments, "verification", result, reviewed),
    ).toBe(4);
  });
  it("advances only as documents, analysis and human decisions become available", () => {
    const result = getDemoAnalysis(false);
    expect(getWorkflowStep({}, null, null, {})).toBe(1);
    expect(
      getWorkflowStep({ agreement: demoDocuments.agreement }, null, null, {}),
    ).toBe(1);
    expect(getWorkflowStep(demoDocuments, null, null, {})).toBe(2);
    expect(getWorkflowStep(demoDocuments, "analysis", null, {})).toBe(2);
    expect(getWorkflowStep(demoDocuments, null, result, {})).toBe(3);
    const reviewed = updateReview({}, result.findings[0].id, {
      decision: "confirmed",
    });
    expect(getWorkflowStep(demoDocuments, null, result, reviewed)).toBe(3);
    expect(
      getWorkflowStep(
        demoDocuments,
        null,
        result,
        updateReview(reviewed, result.findings[0].id, {
          decision: "unreviewed",
        }),
      ),
    ).toBe(3);
    expect(getWorkflowStep(demoDocuments, "agreement", null, {})).toBe(1);
    expect(getWorkflowStep({}, null, null, reviewed)).toBe(1);
  });
  it("keeps the human decision separate from the AI classification", () => {
    const result = getDemoAnalysis(false);
    const reviews = updateReview({}, result.findings[0].id, {
      decision: "confirmed",
      comment: "Avklares med salg",
    });
    const changed = updateReview(reviews, result.findings[1].id, {
      decision: "rejected",
    });
    expect(reviewProgress(result.findings, changed)).toEqual({
      reviewed: 2,
      unresolved: 1,
      total: 3,
    });
    expect(result.findings[0].classification).toBe("potentially_missing");
    expect(parseSession(serializeSession(result, changed))?.reviews).toEqual(
      changed,
    );
    expect(
      reviewProgress(
        result.findings,
        updateReview(changed, result.findings[0].id, {
          decision: "unreviewed",
        }),
      ).unresolved,
    ).toBe(2);
  });
  it("comments do not count as reviewed and malformed sessions are ignored", () => {
    const result = getDemoAnalysis(false);
    expect(
      reviewProgress(
        result.findings,
        updateReview({}, result.findings[0].id, { comment: "Notat" }),
      ).reviewed,
    ).toBe(0);
    for (const value of [null, "bad json", "{}", '{"result":null}'])
      expect(parseSession(value)).toBeNull();
    expect(() =>
      updateReview({}, "F-1", { comment: "a".repeat(1001) }),
    ).toThrow();
  });
});
describe("evaluation bookkeeping (mocked, not AI quality results)", () => {
  it("has ten validated synthetic cases and source-grounded expected labels", () => {
    expect(dataset).toHaveLength(10);
    for (const c of dataset) {
      expect(documentsSchema.safeParse(c.documents).success).toBe(true);
      for (const e of c.expected)
        expect(quoteExists(e.anchor, c.documents.agreement.text)).toBe(true);
    }
  });
  it("counts missed omissions and false positive flags without inventing responses", () => {
    const c = dataset[0];
    expect(scoreCase(c, []).missedOmissions).toBe(1);
    const finding = {
      ...demoResponse.findings[0],
      sourceQuote: c.expected[0].anchor,
      title: "ERP-integrasjon",
      category: "integrations" as const,
    };
    const findings = createAnalysis(
      { findings: [finding] },
      c.documents,
      "demo",
      "test fixture",
    ).findings;
    expect(scoreCase(c, findings)).toMatchObject({
      correctlyIdentifiedOmissions: 1,
      missedOmissions: 0,
      classificationAccuracy: 1,
    });
    expect(scoreCase(dataset[8], findings)).toMatchObject({
      falsePositiveFindings: 1,
      extraFindings: 1,
      classificationAccuracy: 0,
    });
  });
});
