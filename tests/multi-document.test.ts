import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  demoDocuments,
  demoResponse,
  getDemoAnalysis,
  multiDemoDocuments,
  multiDemoResponse,
} from "../src/lib/demo";
import { createAnalysis, validateFindings } from "../src/lib/evidence";
import {
  documentsSchema,
  documentLabels,
  supportingIds,
  type AiFinding,
} from "../src/lib/schemas";
import { extractDocument } from "../src/lib/files";
import {
  createDemoProposal,
  checkDemoProposal,
} from "../src/lib/proposal-demo";
import {
  canApproveDraft,
  draftDocument,
  proposalContext,
  createProposal,
  reviewSignature,
} from "../src/lib/proposal";
import {
  createReanalysis,
  hasCompleteBaseline,
  reanalysisInput,
} from "../src/lib/reanalysis";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@google/genai", () => ({
  ThinkingLevel: { LOW: "LOW" },
  GoogleGenAI: class {
    models = { generateContent: generate };
  },
}));
vi.mock("server-only", () => ({}));
import { POST as analyze } from "../src/app/api/analyze/route";
import { POST as upload } from "../src/app/api/documents/route";
import { SYSTEM_INSTRUCTION } from "../src/lib/server/gemini";
import { reanalyzeCommitments } from "../src/lib/server/reanalysis";
import { generateProposal } from "../src/lib/server/proposal";

const supportingFinding = (): AiFinding =>
  structuredClone(multiDemoResponse.findings.at(-1)!);
const reviewed = () => {
  const analysis = getDemoAnalysis();
  const reviews = Object.fromEntries(
    analysis.findings.map((f) => [
      f.id,
      { decision: "confirmed" as const, comment: "" },
    ]),
  );
  return { analysis, reviews, syntheticOnly: true as const };
};
const jsonRequest = (body: unknown) =>
  new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });

describe("optional documents and bounded extraction", () => {
  it("retains the two required inputs and accepts precisely three typed optional slots", () => {
    expect(documentsSchema.safeParse(demoDocuments).success).toBe(true);
    const all = {
      ...multiDemoDocuments,
      proposal: {
        ...multiDemoDocuments.correspondence!,
        id: "proposal",
        documentType: "proposal",
      },
      meeting_notes: {
        ...multiDemoDocuments.correspondence!,
        id: "meeting_notes",
        documentType: "meeting_notes",
      },
    };
    expect(documentsSchema.safeParse(all).success).toBe(true);
    expect(
      documentsSchema.safeParse({ ...all, fourth: { ...all.proposal } })
        .success,
    ).toBe(false);
    expect(
      documentsSchema.safeParse({
        ...all,
        proposal: { ...all.proposal, documentType: "agreement" },
      }).success,
    ).toBe(false);
    expect(
      documentsSchema.safeParse({ ...all, agreement: undefined }).success,
    ).toBe(false);
    expect(
      documentsSchema.safeParse({ ...all, handover: undefined }).success,
    ).toBe(false);
  });
  it("keeps the shared 40,000 character budget without dropping optional text", () => {
    const large = {
      ...multiDemoDocuments,
      agreement: { ...multiDemoDocuments.agreement, text: "a".repeat(20000) },
      handover: { ...multiDemoDocuments.handover, text: "b".repeat(20000) },
    };
    expect(documentsSchema.safeParse(large).success).toBe(false);
    expect(
      documentsSchema.safeParse({ ...large, correspondence: undefined })
        .success,
    ).toBe(true);
  });
  it.each(supportingIds)(
    "extracts TXT for the stable %s source slot",
    async (id) => {
      const document = await extractDocument(
        new File(
          ["Kun syntetiske, relevante salgsopplysninger."],
          "eksempel.txt",
          { type: "text/plain" },
        ),
        id,
      );
      expect(document).toMatchObject({ id, documentType: id, type: "txt" });
      expect(documentLabels[id].length).toBeGreaterThan(5);
    },
  );
  it("accepts correspondence through the actual upload route", async () => {
    const form = new FormData();
    form.set("id", "correspondence");
    form.set("syntheticOnly", "true");
    form.set(
      "file",
      new File(
        ["Syntetisk e-post: Kunden ønsker digitalt oppstartsmøte."],
        "epost.txt",
        { type: "text/plain" },
      ),
    );
    const reply = await upload(
      new Request("http://localhost/api/documents", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: form,
      }),
    );
    expect(reply.status).toBe(200);
    expect((await reply.json()).document).toMatchObject({
      id: "correspondence",
      documentType: "correspondence",
    });
  });
});

describe("source verification, authority and duplicate information", () => {
  it("verifies the exact primary source rather than looking for a quote anywhere", () => {
    const f = supportingFinding();
    const valid = validateFindings({ findings: [f] }, multiDemoDocuments)[0];
    expect(valid.sourceDocumentId).toBe("correspondence");
    expect(valid.evidence.source).toBe("verified");
    const wrong = validateFindings(
      { findings: [{ ...f, sourceDocumentId: "agreement" }] },
      multiDemoDocuments,
    )[0];
    expect(wrong.evidence.source).toBe("unverified");
    expect(wrong.classification).toBe("needs_clarification");
  });
  it.each(supportingIds)("verifies a primary quote in the %s slot", (id) => {
    const f = { ...supportingFinding(), sourceDocumentId: id };
    const documents = documentsSchema.parse({
      ...multiDemoDocuments,
      [id]: { ...multiDemoDocuments.correspondence!, id, documentType: id },
    });
    const result = validateFindings({ findings: [f] }, documents)[0];
    expect(result.sourceDocumentId).toBe(id);
    expect(result.evidence.source).toBe("verified");
    expect(result.informationType).toBe("follow_up");
  });
  it("rejects fabricated document references and verifies every related quote", () => {
    expect(() =>
      validateFindings(
        {
          findings: [{ ...supportingFinding(), sourceDocumentId: "proposal" }],
        },
        multiDemoDocuments,
      ),
    ).toThrow(/ikke er lastet opp/);
    const f = structuredClone(
      multiDemoResponse.findings.find((f) => f.informationType === "conflict")!,
    );
    f.relatedSources[0].quote =
      "Dette oppdiktede sitatet finnes ikke i e-posten.";
    const result = validateFindings({ findings: [f] }, multiDemoDocuments)[0];
    expect(result.evidence.relatedSources).toEqual(["unverified"]);
    expect(result.evidence.status).toBe("unverified");
  });
  it("never promotes a supporting source to a contractual promise", () => {
    const f = {
      ...supportingFinding(),
      informationType: "contractual" as const,
      requiresConfirmation: false,
      classification: "covered" as const,
      handoverQuote: multiDemoDocuments.handover.text.slice(0, 45),
    };
    const result = validateFindings({ findings: [f] }, multiDemoDocuments)[0];
    expect(result).toMatchObject({
      informationType: "follow_up",
      requiresConfirmation: true,
      classification: "needs_clarification",
    });
  });
  it("keeps non-conflicting practical information non-contractual even if adequately transferred", () => {
    const f = {
      ...supportingFinding(),
      requiresConfirmation: false,
      classification: "covered" as const,
      handoverQuote: supportingFinding().sourceQuote,
    };
    const documents = {
      ...multiDemoDocuments,
      handover: {
        ...multiDemoDocuments.handover,
        text: multiDemoDocuments.handover.text + "\n" + f.sourceQuote,
      },
    };
    expect(validateFindings({ findings: [f] }, documents)[0]).toMatchObject({
      informationType: "follow_up",
      classification: "covered",
    });
  });
  it("forces conflicts and requests needing confirmation to clarification despite a covered response", () => {
    const conflict = {
      ...multiDemoResponse.findings.find(
        (f) => f.informationType === "conflict",
      )!,
      classification: "covered" as const,
    };
    expect(
      validateFindings({ findings: [conflict] }, multiDemoDocuments)[0]
        .classification,
    ).toBe("needs_clarification");
    expect(
      validateFindings(
        {
          findings: [
            { ...supportingFinding(), classification: "potentially_missing" },
          ],
        },
        multiDemoDocuments,
      )[0].classification,
    ).toBe("needs_clarification");
  });
  it("merges identical information across sources and retains verified citations", () => {
    const original = demoResponse.findings[0];
    const repeated = {
      ...original,
      sourceDocumentId: "correspondence" as const,
      informationType: "follow_up" as const,
      title: "ERP omtalt i e-post",
    };
    const findings = validateFindings(
      { findings: [repeated, original] },
      multiDemoDocuments,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      sourceDocumentId: "agreement",
      informationType: "contractual",
      evidence: { source: "verified", relatedSources: ["verified"] },
    });
    expect(findings[0].relatedSources).toContainEqual({
      documentId: "correspondence",
      quote: original.sourceQuote,
    });
    expect(SYSTEM_INSTRUCTION).toContain("Samle semantiske duplikater");
  });
  it.each([false, true])("merges mirrored invoice conflicts while keeping both sources (reversed=%s)", (reversed) => {
    const agreement = structuredClone(multiDemoResponse.findings.find(f => f.informationType === "conflict")!);
    const email: AiFinding = {
      ...agreement,
      title: "Kundeforventning om migrering av historiske fakturaer",
      description: "Kunden forventer migrering som er unntatt i avtalen.",
      sourceDocumentId: "correspondence",
      sourceQuote: agreement.relatedSources[0].quote,
      relatedSources: [{ documentId: "agreement", quote: agreement.sourceQuote }],
      informationType: "follow_up",
    };
    const findings = validateFindings({ findings: reversed ? [email, agreement] : [agreement, email] }, multiDemoDocuments);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      sourceDocumentId: "agreement",
      sourceQuote: agreement.sourceQuote,
      informationType: "conflict",
      requiresConfirmation: true,
      classification: "needs_clarification",
      evidence: { status: "verified", relatedSources: ["verified"] },
    });
    expect(findings[0].relatedSources).toEqual(agreement.relatedSources);
    expect(findings[0].id).toBe(validateFindings({ findings: [agreement] }, multiDemoDocuments)[0].id);
  });
  it("does not merge conflicts when the complete evidence differs", () => {
    const agreement = structuredClone(multiDemoResponse.findings.find(f => f.informationType === "conflict")!);
    const other: AiFinding = {
      ...agreement,
      title: "Et eget spørsmål om møtet",
      description: "Separat informasjon med et annet kildeutdrag.",
      sourceDocumentId: "correspondence",
      sourceQuote: supportingFinding().sourceQuote,
      relatedSources: [{ documentId: "agreement", quote: agreement.sourceQuote }],
    };
    expect(validateFindings({ findings: [agreement, other] }, multiDemoDocuments)).toHaveLength(2);
  });
  it("does not collapse distinct commitments that cite the same paragraph and category", () => {
    const quote =
      "Leverandøren leverer fase én 1. desember og fase to 15. desember.";
    const documents = {
      ...demoDocuments,
      agreement: {
        ...demoDocuments.agreement,
        text: demoDocuments.agreement.text + "\n" + quote,
      },
    };
    const first = {
      ...demoResponse.findings[0],
      category: "deadlines" as const,
      title: "Frist for fase én",
      description: "Fase én leveres 1. desember.",
      sourceQuote: quote,
    };
    const second = {
      ...first,
      title: "Frist for fase to",
      description: "Fase to leveres 15. desember.",
    };
    const findings = validateFindings({ findings: [first, second] }, documents);
    expect(findings).toHaveLength(2);
    expect(new Set(findings.map((f) => f.id)).size).toBe(2);
  });
  it("keeps a two-document analysis working with no optional files", () => {
    const result = createAnalysis(
      demoResponse,
      demoDocuments,
      "demo",
      "two-document fixture",
    );
    expect(result.findings).toHaveLength(7);
    expect(
      result.findings.every((f) => f.sourceDocumentId === "agreement"),
    ).toBe(true);
  });
});

describe("multi-source proposal, fixed baseline and demo", () => {
  it("keeps current example downloads, metadata and all eight verified demo findings in sync", () => {
    for (const document of Object.values(multiDemoDocuments)) {
      expect(readFileSync(`public/examples/${document.name}`, "utf8").trim())
        .toBe(document.text);
      expect(document.bytes).toBe(new TextEncoder().encode(document.text).length);
    }
    const { findings } = getDemoAnalysis();
    expect(findings).toHaveLength(8);
    expect(findings.every(f => f.evidence.status === "verified")).toBe(true);
    expect(findings.filter(f => f.classification === "covered")).toHaveLength(3);
    expect(findings.filter(f => f.classification === "potentially_missing")).toHaveLength(2);
    expect(findings.filter(f => f.classification === "needs_clarification")).toHaveLength(3);
  });
  it("distinguishes transferred open issues from missing information in the demo", () => {
    const input = reviewed();
    const draft = createDemoProposal(input);
    const result = checkDemoProposal(input.analysis, draftDocument(draft.text));
    expect(result.findings.every(f => f.classification === "covered")).toBe(true);
    expect(hasCompleteBaseline(input.analysis, result)).toBe(true);
    const followUps = result.findings.filter(f => f.requiresConfirmation);
    expect(followUps).toHaveLength(2);
    expect(followUps.every(f => f.evidence.handover === "verified")).toBe(true);
    for (const f of followUps) {
      const removed = draft.text.replace(f.handoverQuote!, "");
      const rechecked = checkDemoProposal(input.analysis, draftDocument(removed));
      expect(rechecked.findings.find(item => item.id === f.id)?.classification).not.toBe("covered");
    }
  });
  it.each(["documented", "absent", "unverified", "not_explicitly_documented", "claimed_agreement"] as const)("validates live follow-up coverage: %s", scenario => {
    const { analysis } = reviewed();
    const followUp = analysis.findings.find(f => f.sourceDocumentId === "correspondence")!;
    const draft = draftDocument("Åpen oppfølging: " + followUp.sourceQuote + " Dette er et ønske som må avklares, ikke en godkjent leveranse.");
    const result = createReanalysis(reanalysisInput(analysis, draft), {
      findings: [{
        findingId: followUp.id,
        classification: "covered",
        coverageBasis: scenario === "not_explicitly_documented" ? "insufficient"
          : scenario === "claimed_agreement" ? "agreement_requirement" : "documented_follow_up",
        handoverQuote: scenario === "absent" ? null : scenario === "unverified" ? "Et oppdiktet sitat om oppstartsmøtet." : draft.text,
        explanation: "Vurdering av om kundens ønske er overført som åpen oppfølging.",
      }],
    }, "live", "mock only");
    const checked = result.findings.find(f => f.id === followUp.id)!;
    expect(checked.classification).toBe(scenario === "documented" ? "covered" : "needs_clarification");
    expect(checked.requiresConfirmation).toBe(true);
    expect(checked.informationType).toBe("follow_up");
    expect(checked.sourceQuote).toBe(followUp.sourceQuote);
    expect(result.findings).toHaveLength(analysis.findings.length);
    expect(hasCompleteBaseline(analysis, result)).toBe(false);
  });

  it("carries support information as questions rather than silently changing the contract", () => {
    const input = reviewed();
    const before = structuredClone(input.analysis);
    const proposal = createDemoProposal(input);
    expect(proposal.text).toContain("Punktet er åpent og endrer ikke avtalen");
    expect(proposal.followUps.join(" ")).toContain("historiske fakturaer");
    expect(proposal.followUps.join(" ")).toContain("Teams");
    expect(proposal.text).toContain("Historiske fakturaer skal ikke migreres");
    expect(input.analysis).toEqual(before);
    const context = proposalContext(input);
    expect(context.documents.map((d) => d.documentId)).toContain(
      "correspondence",
    );
    expect(
      context.findings.find((f) => f.informationType === "conflict")
        ?.relatedSources[0].verified,
    ).toBe(true);
  });
  it("keeps all eight original findings, source documents and authority after demo re-analysis", () => {
    const input = reviewed();
    const proposal = createDemoProposal(input);
    const result = checkDemoProposal(
      input.analysis,
      draftDocument(proposal.text),
    );
    expect(hasCompleteBaseline(input.analysis, result)).toBe(true);
    expect(result.findings).toHaveLength(8);
    expect(result.documents.correspondence).toEqual(
      input.analysis.documents.correspondence,
    );
    result.findings.forEach((f, i) =>
      expect({
        id: f.id,
        source: f.sourceDocumentId,
        quote: f.sourceQuote,
        related: f.relatedSources,
        kind: f.informationType,
      }).toEqual({
        id: input.analysis.findings[i].id,
        source: input.analysis.findings[i].sourceDocumentId,
        quote: input.analysis.findings[i].sourceQuote,
        related: input.analysis.findings[i].relatedSources,
        kind: input.analysis.findings[i].informationType,
      }),
    );
    expect(
      result.findings.find((f) => f.informationType === "conflict")
        ?.classification,
    ).toBe("covered");
  });
  it("preserves omitted correspondence findings and blocks approval on an empty second response", () => {
    const { analysis, reviews } = reviewed();
    const draft = draftDocument(analysis.documents.handover.text);
    const result = createReanalysis(
      reanalysisInput(analysis, draft),
      { findings: [] },
      "live",
      "mock only",
    );
    expect(result.findings).toHaveLength(8);
    const support = result.findings.find(
      (f) => f.sourceDocumentId === "correspondence",
    )!;
    expect(support).toMatchObject({
      evaluationStatus: "not_evaluated",
      classification: "needs_clarification",
      informationType: "follow_up",
    });
    expect(support.evidence.source).toBe("verified");
    const signature = reviewSignature(analysis, reviews);
    expect(
      canApproveDraft(draft.text, signature, signature, result, analysis),
    ).toBe(false);
    expect(
      hasCompleteBaseline(analysis, {
        ...result,
        documents: {
          ...result.documents,
          correspondence: {
            ...result.documents.correspondence!,
            text: "En annen syntetisk e-post med endret innhold.",
          },
        },
      }),
    ).toBe(false);
  });
  it("also preserves a single omitted supporting-source finding in a partial second response", () => {
    const { analysis, reviews } = reviewed();
    const draft = draftDocument(analysis.documents.handover.text);
    const result = createReanalysis(
      reanalysisInput(analysis, draft),
      {
        findings: analysis.findings
          .filter((f) => f.sourceDocumentId !== "correspondence")
          .map((f) => ({
            findingId: f.id,
            classification: f.classification,
            coverageBasis: f.classification === "covered" ? "agreement_requirement" as const : "insufficient" as const,
            explanation: "En vurdering av det samme opprinnelige funnet.",
            handoverQuote: f.handoverQuote,
          })),
      },
      "live",
      "mock only",
    );
    expect(result.findings).toHaveLength(8);
    expect(
      result.findings.filter((f) => f.evaluationStatus === "not_evaluated"),
    ).toHaveLength(1);
    const signature = reviewSignature(analysis, reviews);
    expect(
      canApproveDraft(draft.text, signature, signature, result, analysis),
    ).toBe(false);
  });
  it("applies the unchanged shared text budget to proposals and replacement drafts", () => {
    const input = reviewed();
    input.analysis.documents.agreement.text = "a".repeat(20000);
    input.analysis.documents.correspondence!.text = "b".repeat(19950);
    input.analysis.documents.handover.text = "c".repeat(30);
    expect(proposalContext(input).maxDraftCharacters).toBe(50);
    expect(() =>
      reanalysisInput(input.analysis, draftDocument("d".repeat(100))),
    ).toThrow(/40 000/);
    expect(() =>
      createProposal(
        { text: "d".repeat(100), changes: [], followUps: [] },
        input,
        "live",
        "mock only",
      ),
    ).toThrow(/40 000/);
  });
  it("retains source hierarchy if re-analysis tries to mark a source conflict covered", () => {
    const { analysis } = reviewed();
    const result = createReanalysis(
      reanalysisInput(analysis, analysis.documents.handover),
      {
        findings: analysis.findings.map((f) => ({
          findingId: f.id,
          classification: "covered",
          coverageBasis: "agreement_requirement",
          explanation: "Modellen hevder at dette er dekket i notatet.",
          handoverQuote: analysis.documents.handover.text.slice(0, 45),
        })),
      },
      "live",
      "mock only",
    );
    expect(
      result.findings.find((f) => f.informationType === "conflict")
        ?.classification,
    ).toBe("needs_clarification");
  });
});

describe("multi-document SDK and HTTP boundaries, mocked without quota", () => {
  beforeEach(() => {
    generate.mockReset();
    vi.stubEnv("GEMINI_API_KEY", "synthetic-test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
  });
  it("passes optional source IDs and types through the real analysis route", async () => {
    generate.mockResolvedValue({ text: JSON.stringify(multiDemoResponse) });
    const reply = await analyze(
      jsonRequest({ ...multiDemoDocuments, syntheticOnly: true }),
    );
    expect(reply.status).toBe(200);
    expect((await reply.json()).result.findings).toHaveLength(8);
    const sent = generate.mock.calls[0][0];
    const payload = JSON.parse(sent.contents[0].parts[0].text);
    expect(
      payload.documents.map((d: { documentId: string }) => d.documentId),
    ).toEqual(["agreement", "handover", "correspondence"]);
    expect(payload.documents[2]).toMatchObject({
      documentId: "correspondence",
      documentType: "correspondence",
      text: multiDemoDocuments.correspondence!.text,
    });
  });
  it("rejects combined text overflow before any provider call", async () => {
    const large = {
      ...multiDemoDocuments,
      agreement: { ...multiDemoDocuments.agreement, text: "a".repeat(20000) },
      handover: { ...multiDemoDocuments.handover, text: "b".repeat(20000) },
      syntheticOnly: true,
    };
    expect((await analyze(jsonRequest(large))).status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });
  it("sends every original source and original reference in fixed-baseline re-analysis", async () => {
    const { analysis } = reviewed();
    generate.mockResolvedValue({ text: '{"findings":[]}' });
    const result = await reanalyzeCommitments(
      reanalysisInput(analysis, analysis.documents.handover),
    );
    const context = JSON.parse(
      generate.mock.calls[0][0].contents[0].parts[0].text,
    );
    expect(
      context.documents.map((d: { documentId: string }) => d.documentId),
    ).toEqual(["agreement", "correspondence", "updated_handover"]);
    expect(
      context.commitments.find(
        (f: { sourceDocumentId: string }) =>
          f.sourceDocumentId === "correspondence",
      ).informationType,
    ).toBe("follow_up");
    expect(result.findings).toHaveLength(8);
  });
  it("passes multi-source authority and verified citations through proposal generation", async () => {
    const input = reviewed();
    generate.mockResolvedValue({
      text: JSON.stringify({
        updates: [],
        followUps: [
          "Avklar kundens forventning om historiske fakturaer mot avtalen.",
        ],
      }),
    });
    const result = await generateProposal(input);
    expect(result.mode).toBe("live");
    const sent = generate.mock.calls[0][0];
    const context = JSON.parse(sent.contents[0].parts[0].text);
    expect(
      context.documents.map((d: { documentId: string }) => d.documentId),
    ).toContain("correspondence");
    expect(
      context.findings.find(
        (f: { informationType: string }) => f.informationType === "conflict",
      ),
    ).toMatchObject({
      requiresConfirmation: true,
      sourceQuoteVerified: true,
      relatedSources: [{ documentId: "correspondence", verified: true }],
    });
    expect(sent.config.systemInstruction).toContain(
      "Støttedokumenter kan aldri overstyre avtalen",
    );
  });
  it("runs the complete multi-source demo without contacting Gemini", () => {
    const input = reviewed();
    const draft = createDemoProposal(input);
    expect(
      checkDemoProposal(input.analysis, draftDocument(draft.text)).mode,
    ).toBe("demo");
    expect(generate).not.toHaveBeenCalled();
  });
});
