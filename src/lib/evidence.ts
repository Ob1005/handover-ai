import {
  aiResponseSchema,
  analysisSchema,
  type AiFinding,
  type AiResponse,
  type AnalysisResult,
  type Documents,
  type Finding,
} from "./schemas";
import { AppError } from "./errors";

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
function stableId(value: string) {
  let hash = 2166136261;
  for (const char of value)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
// A mirrored conflict cites the same evidence from opposite primary sources.
// Match the complete reference set, never titles or shared keywords.
function mirroredConflict(a: AiFinding, b: AiFinding) {
  if (
    a.category !== b.category ||
    a.sourceDocumentId === b.sourceDocumentId ||
    (a.informationType !== "conflict" && b.informationType !== "conflict")
  ) return false;
  const references = (finding: AiFinding) => [...new Set([
    `${finding.sourceDocumentId}|${normalizeWhitespace(finding.sourceQuote)}`,
    ...finding.relatedSources.map(ref => `${ref.documentId}|${normalizeWhitespace(ref.quote)}`),
  ])].sort();
  const left = references(a);
  const right = references(b);
  return left.length >= 2 &&
    left.some(ref => ref.startsWith("agreement|")) &&
    JSON.stringify(left) === JSON.stringify(right);
}
// Preserve distinct requirements quoting the same paragraph. Semantic duplicates
// without identical evidence remain Gemini's responsibility.
function mergeDuplicates(findings: AiFinding[]): AiFinding[] {
  const groups = new Map<string, AiFinding>();
  for (const item of findings) {
    const key = `${item.category}|${normalizeWhitespace(item.sourceQuote)}|${normalizeWhitespace(item.description)}`;
    const mirrored = [...groups.entries()].filter(([, existing]) =>
      mirroredConflict(existing, item),
    );
    // Multiple matches are ambiguous; don't guess which requirement to merge.
    const groupKey = groups.has(key) ? key : mirrored.length === 1 ? mirrored[0][0] : key;
    const previous = groups.get(groupKey);
    if (!previous) {
      groups.set(key, { ...item, relatedSources: [...item.relatedSources] });
      continue;
    }
    const primary = item.sourceDocumentId === "agreement" ? item : previous;
    const other = primary === item ? previous : item;
    const refs = [
      ...primary.relatedSources,
      { documentId: other.sourceDocumentId, quote: other.sourceQuote },
      ...other.relatedSources,
    ];
    const unique = new Map(
      refs
        .filter(
          (ref) =>
            ref.documentId !== primary.sourceDocumentId ||
            normalizeWhitespace(ref.quote) !==
              normalizeWhitespace(primary.sourceQuote),
        )
        .map((ref) => [
          `${ref.documentId}|${normalizeWhitespace(ref.quote)}`,
          ref,
        ]),
    );
    if (unique.size > 3)
      throw new AppError(
        "Modellsvaret inneholder for mange kildehenvisninger for ett funn. Bruk kortere, samlede sitater.",
        502,
      );
    const conflict =
      item.informationType === "conflict" ||
      previous.informationType === "conflict";
    groups.set(groupKey, {
      ...primary,
      relatedSources: [...unique.values()],
      informationType: conflict ? "conflict" : primary.informationType,
      certainty:
        item.certainty === "ambiguous" || previous.certainty === "ambiguous"
          ? "ambiguous"
          : primary.certainty,
      requiresConfirmation:
        conflict || item.requiresConfirmation || previous.requiresConfirmation,
      classification:
        conflict || item.classification !== previous.classification
          ? "needs_clarification"
          : primary.classification,
    });
  }
  return [...groups.values()];
}
export function validateFindings(
  response: AiResponse,
  documents: Documents,
): Finding[] {
  const parsed = aiResponseSchema.parse(response);
  const seen = new Set<string>();
  return mergeDuplicates(parsed.findings).map((finding) => {
    const sourceDoc = documents[finding.sourceDocumentId];
    if (
      !sourceDoc ||
      finding.relatedSources.some((ref) => !documents[ref.documentId])
    )
      throw new AppError(
        "Modellsvaret viser til en kilde som ikke er lastet opp. Kjør analysen på nytt.",
        502,
      );
    const id = `F-${stableId(`${finding.sourceDocumentId}|${normalizeWhitespace(finding.sourceQuote)}|${finding.category}|${finding.title}`)}`;
    if (seen.has(id))
      throw new AppError(
        "Dupliserte funn-ID-er i modellsvaret. Prøv analysen på nytt.",
        502,
      );
    seen.add(id);
    const source = quoteExists(finding.sourceQuote, sourceDoc.text)
      ? "verified"
      : "unverified";
    const relatedSources = finding.relatedSources.map((ref) =>
      quoteExists(ref.quote, documents[ref.documentId]!.text)
        ? ("verified" as const)
        : ("unverified" as const),
    );
    const handover =
      finding.handoverQuote === null
        ? "not_provided"
        : quoteExists(finding.handoverQuote, documents.handover.text)
          ? "verified"
          : "unverified";
    const invalidAuthority =
      (finding.sourceDocumentId !== "agreement" ||
        finding.certainty === "ambiguous" ||
        finding.requiresConfirmation) &&
      finding.informationType === "contractual";
    const informationType = invalidAuthority
      ? "follow_up"
      : finding.informationType;
    const requiresConfirmation =
      finding.requiresConfirmation ||
      invalidAuthority ||
      informationType === "conflict" ||
      finding.certainty === "ambiguous";
    const unsafe =
      source === "unverified" ||
      relatedSources.includes("unverified") ||
      handover === "unverified" ||
      requiresConfirmation ||
      (finding.classification === "covered" && handover === "not_provided");
    return {
      ...finding,
      informationType,
      requiresConfirmation,
      modelClassification: finding.classification,
      classification: unsafe ? "needs_clarification" : finding.classification,
      id,
      sources: {
        source: finding.sourceDocumentId,
        handover: finding.handoverQuote === null ? null : "handover",
      },
      evidence: {
        source,
        relatedSources,
        handover,
        status:
          source === "verified" &&
          !relatedSources.includes("unverified") &&
          handover !== "unverified"
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
    id: `${mode}-${crypto.randomUUID()}`,
    mode,
    model,
    createdAt: new Date().toISOString(),
    documents,
    findings: validateFindings(response, documents),
  });
}
