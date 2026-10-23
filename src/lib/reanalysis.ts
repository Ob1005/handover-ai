import { z } from "zod";
import {
  analysisSchema,
  aiFindingSchema,
  documentSchema,
  documentsSchema,
  listDocuments,
  findingSchema,
  type AnalysisResult,
  type UploadedDocument,
} from "./schemas";
import { validateFindings } from "./evidence";

export const reanalysisRequestSchema = z
  .object({
    baseline: analysisSchema.refine(
      (value) =>
        value.findings.length > 0 &&
        new Set(value.findings.map((f) => f.id)).size ===
          value.findings.length &&
        value.findings.every((f) => f.id.length <= 100),
      "Kontrollgrunnlaget må inneholde unike, opprinnelige funn.",
    ),
    handover: documentSchema.extend({
      id: z.literal("handover"),
      documentType: z.literal("handover"),
    }),
    syntheticOnly: z.literal(true),
  })
  .strict()
  .refine(
    (value) =>
      documentsSchema.safeParse({
        ...value.baseline.documents,
        handover: value.handover,
      }).success,
    "Maksimalt 40 000 tegn samlet, også med det oppdaterte notatet.",
  );
// The model evaluates existing IDs; it cannot redefine the commitments or sources.
const coverageBasisSchema = z.enum([
  "agreement_requirement",
  "documented_follow_up",
  "insufficient",
]);
export const reanalysisResponseSchema = z
  .object({
    findings: z
      .array(
        z
          .object({
            findingId: z.string().min(1).max(100),
            classification: aiFindingSchema.shape.classification,
            coverageBasis: coverageBasisSchema,
            explanation: aiFindingSchema.shape.explanation,
            handoverQuote: aiFindingSchema.shape.handoverQuote,
          })
          .strict(),
      )
      .max(40),
  })
  .strict();
export const reanalysisSchema = analysisSchema.extend({
  baselineId: z.string().min(1),
  findings: z
    .array(
      findingSchema.extend({
        evaluationStatus: z.enum(["evaluated", "not_evaluated"]),
        coverageBasis: coverageBasisSchema,
      }),
    )
    .max(40),
});
export type ReanalysisRequest = z.infer<typeof reanalysisRequestSchema>;
export type ReanalysisResponse = z.infer<typeof reanalysisResponseSchema>;
export type ReanalysisResult = z.infer<typeof reanalysisSchema>;

export function needsFollowUp(
  finding: Pick<AnalysisResult["findings"][number],
    "requiresConfirmation" | "informationType" | "certainty">,
) {
  return finding.requiresConfirmation ||
    finding.informationType === "conflict" || finding.certainty === "ambiguous";
}

export function isTransferredFollowUp(
  finding: Pick<ReanalysisResult["findings"][number], "classification" | "coverageBasis">,
) {
  return finding.classification === "covered" &&
    finding.coverageBasis === "documented_follow_up";
}

export function createReanalysis(
  input: ReanalysisRequest,
  response: z.input<typeof reanalysisResponseSchema>,
  mode: AnalysisResult["mode"],
  model: string,
): ReanalysisResult {
  const { baseline, handover } = reanalysisRequestSchema.parse(input);
  const parsed = reanalysisResponseSchema.parse(response);
  const ids = new Set(baseline.findings.map((f) => f.id));
  if (parsed.findings.some((f) => !ids.has(f.findingId)))
    throw new Error("Kontrollen viser til en ukjent forpliktelse.");
  const documents = { ...baseline.documents, handover };
  const findings = baseline.findings.map((original) => {
    const matches = parsed.findings.filter((f) => f.findingId === original.id);
    const evaluated = matches.length === 1;
    const assessment = evaluated ? matches[0] : null;
    const [validated] = validateFindings(
      {
        findings: [
          {
            title: original.title,
            description: original.description,
            category: original.category,
            certainty: original.certainty,
            sourceDocumentId: original.sourceDocumentId,
            sourceQuote: original.sourceQuote,
            relatedSources: original.relatedSources,
            informationType: original.informationType,
            requiresConfirmation: original.requiresConfirmation,
            classification: assessment?.classification ?? "needs_clarification",
            handoverQuote: assessment?.handoverQuote ?? null,
            explanation:
              assessment?.explanation ??
              (matches.length > 1
                ? "Funnet fikk flere svar og er ikke entydig vurdert. Kjør kontrollen på nytt."
                : "Det opprinnelige funnet manglet i kontrollsvaret. Kjør kontrollen på nytt før godkjenning."),
          },
        ],
      },
      documents,
    );
    // Reassess coverage without changing the original authority metadata. An
    // initial confirmation flag alone must not permanently block an explicit
    // agreement requirement. Supporting sources and conflicts cannot use this path.
    const verifiedCoverage = evaluated && assessment?.classification === "covered" &&
      validated.evidence.status === "verified" && validated.evidence.handover === "verified";
    const agreementCovered = verifiedCoverage &&
      assessment?.coverageBasis === "agreement_requirement" &&
      original.sourceDocumentId === "agreement" && original.certainty === "explicit" &&
      original.informationType !== "conflict";
    const transferredFollowUp = verifiedCoverage && needsFollowUp(original) &&
      assessment?.coverageBasis === "documented_follow_up";
    const covered = agreementCovered || transferredFollowUp;
    return {
      ...validated,
      classification: covered ? "covered" : assessment?.classification === "covered"
        ? "needs_clarification" : validated.classification,
      coverageBasis: agreementCovered ? "agreement_requirement"
        : transferredFollowUp ? "documented_follow_up" : "insufficient",
      id: original.id,
      evaluationStatus: evaluated ? "evaluated" : "not_evaluated",
    };
  });
  return reanalysisSchema.parse({
    id: `${mode}-reanalysis-${crypto.randomUUID()}`,
    baselineId: baseline.id,
    mode,
    model,
    createdAt: new Date().toISOString(),
    documents,
    findings,
  });
}

export function hasCompleteBaseline(
  baseline: AnalysisResult,
  check: ReanalysisResult | null,
) {
  if (
    !check ||
    !baseline.findings.length ||
    check.baselineId !== baseline.id ||
    listDocuments(baseline.documents)
      .filter((d) => d.id !== "handover")
      .some(
        (d) =>
          check.documents[d.id]?.text !== d.text ||
          check.documents[d.id]?.documentType !== d.documentType,
      ) ||
    check.findings.length !== baseline.findings.length
  )
    return false;
  return baseline.findings.every((original) => {
    const matches = check.findings.filter((f) => f.id === original.id);
    return (
      matches.length === 1 &&
      matches[0].evaluationStatus === "evaluated" &&
      matches[0].sourceDocumentId === original.sourceDocumentId &&
      matches[0].sourceQuote === original.sourceQuote &&
      JSON.stringify(matches[0].relatedSources) ===
        JSON.stringify(original.relatedSources) &&
      matches[0].informationType === original.informationType &&
      matches[0].requiresConfirmation === original.requiresConfirmation &&
      matches[0].title === original.title &&
      matches[0].category === original.category &&
      matches[0].description === original.description &&
      matches[0].certainty === original.certainty
    );
  });
}

export function reanalysisInput(
  baseline: AnalysisResult,
  handover: UploadedDocument,
): ReanalysisRequest {
  return reanalysisRequestSchema.parse({
    baseline,
    handover,
    syntheticOnly: true,
  });
}
