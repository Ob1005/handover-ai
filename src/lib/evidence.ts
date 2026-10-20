import {
  aiResponseSchema,
  analysisSchema,
  type AiResponse,
  type AnalysisResult,
  type Documents,
  type Finding,
} from "./schemas";

export function normalizeWhitespace(value: string) {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}
export function quoteExists(quote: string | null, source: string) {
  return (
    !!quote &&
    normalizeWhitespace(quote).length > 0 &&
    normalizeWhitespace(source).includes(normalizeWhitespace(quote))
  );
}
// Small deterministic identifier, not a security hash. Stable for the same finding.
function stableId(value: string) {
  let hash = 2166136261;
  for (const char of value)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export function validateFindings(
  response: AiResponse,
  documents: Documents,
): Finding[] {
  const parsed = aiResponseSchema.parse(response);
  const seen = new Set<string>();
  return parsed.findings.map((finding) => {
    const key =
      normalizeWhitespace(finding.agreementQuote) +
      "|" +
      finding.category +
      "|" +
      finding.title;
    const id = `F-${stableId(key)}`;
    if (seen.has(id))
      throw new Error("Dupliserte funn i modellsvaret. Prøv analysen på nytt.");
    seen.add(id);
    const agreement = quoteExists(
      finding.agreementQuote,
      documents.agreement.text,
    )
      ? "verified"
      : "unverified";
    const handover =
      finding.handoverQuote === null
        ? "not_provided"
        : quoteExists(finding.handoverQuote, documents.handover.text)
          ? "verified"
          : "unverified";
    // Unsupported evidence or ambiguous language can never be presented as coverage or a definite omission.
    const unsafe =
      agreement === "unverified" ||
      handover === "unverified" ||
      finding.certainty === "ambiguous" ||
      (finding.classification === "covered" && handover === "not_provided");
    return {
      ...finding,
      modelClassification: finding.classification,
      classification: unsafe ? "needs_clarification" : finding.classification,
      explanation: finding.explanation,
      id,
      sources: {
        agreement: "agreement",
        handover: finding.handoverQuote === null ? null : "handover",
      },
      evidence: {
        agreement,
        handover,
        status:
          agreement === "verified" && handover !== "unverified"
            ? "verified"
            : "unverified",
      },
    };
  });
}
export function createAnalysis(
  response: AiResponse,
  documents: Documents,
  mode: AnalysisResult["mode"],
  model: string,
): AnalysisResult {
  return analysisSchema.parse({
    id: `${mode}-${globalThis.crypto.randomUUID()}`,
    mode,
    model,
    createdAt: new Date().toISOString(),
    documents,
    findings: validateFindings(response, documents),
  });
}
