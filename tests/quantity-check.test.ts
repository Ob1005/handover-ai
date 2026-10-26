import { describe, expect, it } from "vitest";
import { checkQuantities } from "../src/lib/quantity-check";
import { createAnalysis } from "../src/lib/evidence";
import { demoResponse, demoDocuments } from "../src/lib/demo";
import { createReanalysis, reanalysisInput } from "../src/lib/reanalysis";
import { draftDocument } from "../src/lib/proposal";

describe("literal duration and clock evidence", () => {
  it.each([
    ["ti virkedager", "fem virkedager", "mismatch"],
    ["ti virkedager", "10 arbeidsdager", "match"],
    ["åtte virkedager", "8 virkedager", "match"],
    ["30 kalenderdager", "tretti kalenderdager", "match"],
    ["ti virkedager", "ti kalenderdager", "mismatch"],
    ["to uker", "ti virkedager", "mismatch"],
    ["ti virkedager", "fem virkedager eller ti virkedager", "mismatch"],
    ["ti virkedager", "Oppfølging er inkludert.", "mismatch"],
    ["kl. 06.00", "kl. 08.00", "mismatch"],
    ["kl. 08.00", "kl 8:00", "match"],
    ["innen 30 minutter", "innen tretti minutter", "match"],
    ["Oppsett er inkludert.", "Oppsett er inkludert.", "not_checked"],
  ])("compares %s with %s", (source, handover, result) => {
    expect(checkQuantities(source, handover)).toBe(result);
  });
  it("never treats a missing quote as a completed numeric check", () => {
    expect(checkQuantities("ti virkedager", null)).toBe("not_checked");
  });
  it("allows both values in documented open follow-up but still requires the agreement value", () => {
    expect(checkQuantities("ti virkedager", "fem virkedager i salgsnotatet mot ti virkedager i avtalen; avklares", true)).toBe("match");
    expect(checkQuantities("ti virkedager", "fem virkedager må avklares", true)).toBe("mismatch");
  });
});

describe("recorded PDF failure: five versus ten working days", () => {
  const source = "Oppstartsoppfølging er inkludert i ti virkedager etter produksjonssetting.";
  const wrong = "Vi har satt av fem virkedager til oppstartsoppfølging etter produksjonssetting.";
  const correct = "Oppstartsoppfølging er inkludert i 10 virkedager etter produksjonssetting.";
  function fixture() {
    const documents = {
      agreement: { ...demoDocuments.agreement, text: source },
      handover: { ...demoDocuments.handover, text: wrong },
    };
    const raw = { findings: [{ ...demoResponse.findings[0],
      title: "Oppstartsoppfølging", category: "service" as const,
      sourceQuote: source, handoverQuote: wrong, classification: "covered" as const,
      explanation: "Modellen hevder feilaktig at varigheten er dekket.",
    }] };
    return createAnalysis(raw, documents, "live", "mock only");
  }
  it("overrides a covered claim even though both quotes are genuinely present", () => {
    const finding = fixture().findings[0];
    expect(finding).toMatchObject({
      modelClassification: "covered", classification: "needs_clarification",
      evidence: { source: "verified", handover: "verified", status: "verified", quantities: "mismatch" },
    });
  });
  it.each([wrong, correct])("reanalysis cannot bypass the check: %s", text => {
    const baseline = fixture();
    const result = createReanalysis(reanalysisInput(baseline, draftDocument(text)), {
      findings: [{ findingId: baseline.findings[0].id, classification: "covered",
        coverageBasis: "agreement_requirement", handoverQuote: text,
        explanation: "En ny modellvurdering av oppfølgingsperioden." }],
    }, "live", "mock only");
    expect(result.findings[0].classification).toBe(text === correct ? "covered" : "needs_clarification");
  });
  it.each([false, true])("requires the contractual duration even in an open follow-up: %s", bothSides => {
    const baseline = fixture();
    baseline.findings[0].informationType = "conflict";
    baseline.findings[0].requiresConfirmation = true;
    const text = bothSides ? `${source} Salgsnotatet sier: ${wrong} Dette avviket skal følges opp.` : wrong;
    const result = createReanalysis(reanalysisInput(baseline, draftDocument(text)), {
      findings: [{ findingId: baseline.findings[0].id, classification: "covered",
        coverageBasis: "documented_follow_up", handoverQuote: text,
        explanation: "Modellen vurderer avviket som dokumentert oppfølging." }],
    }, "live", "mock only");
    expect(result.findings[0].classification).toBe(bothSides ? "covered" : "needs_clarification");
  });
});
