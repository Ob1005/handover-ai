import { beforeEach, describe, expect, it, vi } from "vitest";
import { duplicateDocumentMessage } from "../src/lib/document-validation";
import { demoDocuments, multiDemoDocuments } from "../src/lib/demo";
import { supportingIds } from "../src/lib/schemas";
import { getWorkflowStep } from "../src/lib/review";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@google/genai", () => ({
  ThinkingLevel: { LOW: "LOW" },
  GoogleGenAI: class {
    models = { generateContent: generate };
  },
}));
vi.mock("server-only", () => ({}));
import { POST } from "../src/app/api/analyze/route";
import { analyzeDocuments } from "../src/lib/server/gemini";

const duplicatePair = () => ({
  ...demoDocuments,
  handover: {
    ...demoDocuments.handover,
    name: "annet-navn.txt",
    text: demoDocuments.agreement.text,
  },
});

describe("duplicate document inputs", () => {
  it("accepts incomplete inputs, the demo and genuinely different text", () => {
    expect(duplicateDocumentMessage({})).toBeNull();
    expect(duplicateDocumentMessage({ agreement: demoDocuments.agreement })).toBeNull();
    expect(duplicateDocumentMessage(multiDemoDocuments)).toBeNull();
  });
  it("detects the same content in different required roles, regardless of filename", () => {
    const documents = duplicatePair();
    expect(duplicateDocumentMessage(documents)).toContain("«Signert kundeavtale» og «Overleveringsnotat»");
    expect(getWorkflowStep(documents, null, null, {})).toBe(1);
  });
  it("recognises whitespace and Unicode differences across PDF/TXT", () => {
    const documents = duplicatePair();
    documents.agreement.text = "Kunden må få opplæring før oppstart av prosjektet.";
    documents.handover.text = documents.agreement.text.normalize("NFD").replaceAll(" ", "\n\t ");
    documents.handover.type = "pdf";
    documents.handover.name = "kopi.pdf";
    expect(duplicateDocumentMessage(documents)).not.toBeNull();
  });
  it("accepts different documents with the same filename and clears after replacement", () => {
    const documents = duplicatePair();
    documents.handover.name = documents.agreement.name;
    documents.handover.text = demoDocuments.handover.text;
    expect(duplicateDocumentMessage(documents)).toBeNull();
    expect(getWorkflowStep(documents, null, null, {})).toBe(2);
  });
  it.each(supportingIds)("detects a copy in the optional %s slot", (id) => {
    const documents = {
      ...demoDocuments,
      [id]: { ...demoDocuments.agreement, id, documentType: id },
    };
    expect(duplicateDocumentMessage(documents)).not.toBeNull();
    delete documents[id];
    expect(duplicateDocumentMessage(documents)).toBeNull();
  });
});

describe("server rejection before Gemini calls", () => {
  beforeEach(() => generate.mockReset());
  it("rejects duplicate input through the actual analysis route", async () => {
    const response = await POST(new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ ...duplicatePair(), syntheticOnly: true }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "DUPLICATE_DOCUMENTS" });
    expect(generate).not.toHaveBeenCalled();
  });
  it("also guards direct server analysis, without using API quota", async () => {
    await expect(analyzeDocuments(duplicatePair())).rejects.toMatchObject({
      code: "DUPLICATE_DOCUMENTS",
    });
    expect(generate).not.toHaveBeenCalled();
  });
});
