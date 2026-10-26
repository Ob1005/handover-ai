import { describe, expect, it } from "vitest";
import { getDemoAnalysis } from "../src/lib/demo";
import { createEditedProposal, proposalEditContext } from "../src/lib/proposal-edits";
import type { ProposalRequest } from "../src/lib/proposal";

function fixture(): ProposalRequest {
  const analysis = getDemoAnalysis(false);
  return { analysis, reviews: Object.fromEntries(analysis.findings
    .filter(f => f.classification !== "covered")
    .map(f => [f.id, { decision: "confirmed" as const, comment: "" }])), syntheticOnly: true };
}

describe("bounded proposal edits", () => {
  it("changes only the verified target and appends omissions without losing any other original text", () => {
    const input = fixture();
    const date = input.analysis.findings.find(f => f.category === "deadlines")!;
    const csv = input.analysis.findings.find(f => f.category === "customer_responsibilities")!;
    const original = input.analysis.documents.handover.text;
    const proposal = createEditedProposal({ updates: [
      { findingId: date.id, text: date.sourceQuote, summary: "Rettet produksjonsdato etter avtalen." },
      { findingId: csv.id, text: csv.sourceQuote, summary: "Lagt til kundens datafrist." },
    ], followUps: [] }, input, "mock only");
    expect(proposal.text).toBe(original.replace(date.handoverQuote!, date.sourceQuote) +
      "\n\nTILLEGG FRA GJENNOMGANGEN\n" + csv.sourceQuote);
    expect(input.analysis.documents.handover.text).toBe(original);
    for (const finding of input.analysis.findings.filter(f => f.classification === "covered"))
      expect(proposal.text).toContain(finding.handoverQuote!);
  });
  it("keeps the original note intact when there are only follow-up questions", () => {
    const input = fixture();
    const original = input.analysis.documents.handover.text;
    const proposal = createEditedProposal({ updates: [], followUps: ["Bekreft møteform med kunden."] }, input, "mock only");
    expect(proposal.text.startsWith(original + "\n\n")).toBe(true);
    expect(proposal.text).toContain("Bekreft møteform med kunden.");
  });
  it.each(["covered", "rejected", "unknown", "unverified_source", "unverified_target", "repeated_target"] as const)("rejects an unavailable edit: %s", scenario => {
    const input = fixture();
    let finding = input.analysis.findings.find(f => f.category === "deadlines")!;
    if (scenario === "covered") finding = input.analysis.findings.find(f => f.classification === "covered")!;
    if (scenario === "rejected") input.reviews[finding.id].decision = "rejected";
    if (scenario === "unverified_source") finding.sourceQuote = "En kildehenvisning som ikke finnes i avtalen.";
    if (scenario === "unverified_target") finding.handoverQuote = "Et notatsitat som ikke finnes i originalen.";
    if (scenario === "repeated_target") input.analysis.documents.handover.text += "\n" + finding.handoverQuote;
    expect(() => createEditedProposal({ updates: [{ findingId: scenario === "unknown" ? "unknown" : finding.id,
      text: "En foreslått endring i notatet.", summary: "Foreslått rettelse." }], followUps: [] }, input, "mock only")).toThrow();
  });
  it("locates PDF quotations with different line breaks and retains the exact surrounding text", () => {
    const input = fixture();
    const date = input.analysis.findings.find(f => f.category === "deadlines")!;
    const wrapped = date.handoverQuote!.replaceAll(" ", "\n");
    input.analysis.documents.handover.text = input.analysis.documents.handover.text.replace(date.handoverQuote!, wrapped);
    const context = proposalEditContext(input);
    expect(context.findings.find(f => f.id === date.id)?.editTarget?.originalText).toBe(wrapped);
    const original = input.analysis.documents.handover.text;
    expect(createEditedProposal({ updates: [{ findingId: date.id, text: date.sourceQuote,
      summary: "Rettet dato i et linjedelt PDF-utdrag." }], followUps: [] }, input, "mock only").text)
      .toBe(original.replace(wrapped, date.sourceQuote));
  });
  it("rejects overlapping edits rather than applying them in an arbitrary order", () => {
    const input = fixture();
    const first = input.analysis.findings.find(f => f.category === "deadlines")!;
    const second = { ...first, id: "F-second", title: "Et annet funn i samme utdrag" };
    input.analysis.findings.push(second);
    input.reviews[second.id] = { decision: "confirmed", comment: "" };
    expect(() => createEditedProposal({ updates: [first, second].map(f => ({ findingId: f.id,
      text: f.sourceQuote, summary: "Rettelse i samme tekstområde." })), followUps: [] }, input, "mock only")).toThrow(/overlapper/);
  });
  it("protects a covered point inside a larger editable quotation", () => {
    const input = fixture();
    const date = input.analysis.findings.find(f => f.category === "deadlines")!;
    const training = input.analysis.findings.find(f => f.category === "training")!;
    date.handoverQuote = date.handoverQuote + "\n" + training.handoverQuote;
    expect(() => createEditedProposal({ updates: [{ findingId: date.id, text: date.sourceQuote,
      summary: "Rettelse som utilsiktet sletter opplæringen." }], followUps: [] }, input, "mock only")).toThrow(/dekket/);
  });
});
