import { z } from "zod";
import {
  analysisSchema,
  documentSchema,
  MAX_TEXT_LENGTH,
  reviewsSchema,
  type AnalysisResult,
  type Reviews,
} from "./schemas";
import { quoteExists } from "./evidence";

export const proposalRequestSchema = z
  .object({
    analysis: analysisSchema,
    reviews: reviewsSchema,
    syntheticOnly: z.literal(true),
  })
  .strict()
  .superRefine(({ analysis, reviews }, ctx) => {
    const ids = new Set(analysis.findings.map((f) => f.id));
    if (
      ids.size !== analysis.findings.length ||
      [...ids].some((id) => id.length > 100)
    )
      ctx.addIssue({ code: "custom", message: "Ugyldige funn-ID-er." });
    if (
      analysis.findings.some(
        (f) => !reviews[f.id] || reviews[f.id].decision === "unreviewed",
      )
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Alle funn må være bekreftet eller avvist før forslag kan genereres.",
      });
    if (Object.keys(reviews).some((id) => !ids.has(id)))
      ctx.addIssue({
        code: "custom",
        message: "Vurderingene må tilhøre denne analysen.",
      });
  });
export const proposalContentSchema = z
  .object({
    text: z.string().trim().min(20).max(MAX_TEXT_LENGTH),
    changes: z
      .array(
        z
          .object({
            findingId: z.string().min(1).max(100),
            summary: z.string().trim().min(5).max(600),
          })
          .strict(),
      )
      .max(40),
    followUps: z.array(z.string().trim().min(5).max(1200)).max(40),
  })
  .strict();
export const proposalSchema = proposalContentSchema
  .extend({
    id: z.string().min(1),
    mode: z.enum(["demo", "live"]),
    model: z.string().min(1),
    createdAt: z.string().datetime(),
  })
  .strict();
export type ProposalRequest = z.infer<typeof proposalRequestSchema>;
export type ProposalContent = z.infer<typeof proposalContentSchema>;
export type Proposal = z.infer<typeof proposalSchema>;

export function proposalContext(input: ProposalRequest) {
  const parsed = proposalRequestSchema.parse(input);
  return {
    documents: Object.values(parsed.analysis.documents).map((d) => ({
      documentId: d.id,
      text: d.text,
    })),
    findings: parsed.analysis.findings.map((f) => ({
      id: f.id,
      title: f.title,
      classification: f.classification,
      certainty: f.certainty,
      explanation: f.explanation,
      agreementQuote: f.agreementQuote,
      handoverQuote: f.handoverQuote,
      // Never trust verification flags submitted by the browser.
      agreementQuoteVerified: quoteExists(
        f.agreementQuote,
        parsed.analysis.documents.agreement.text,
      ),
      handoverQuoteVerified:
        f.handoverQuote !== null &&
        quoteExists(f.handoverQuote, parsed.analysis.documents.handover.text),
      review: parsed.reviews[f.id],
    })),
  };
}
export function createProposal(
  content: ProposalContent,
  input: ProposalRequest,
  mode: Proposal["mode"],
  model: string,
): Proposal {
  const parsed = proposalContentSchema.parse(content);
  const source = proposalRequestSchema.parse(input);
  const allowed = new Set(
    source.analysis.findings
      .filter((f) => source.reviews[f.id].decision === "confirmed")
      .map((f) => f.id),
  );
  if (parsed.changes.some((c) => !allowed.has(c.findingId)))
    throw new Error(
      "Forslaget viser til et avvist eller ukjent funn. Generer forslaget på nytt.",
    );
  return proposalSchema.parse({
    ...parsed,
    id: `proposal-${crypto.randomUUID()}`,
    mode,
    model,
    createdAt: new Date().toISOString(),
  });
}
export function draftDocument(text: string) {
  return documentSchema.parse({
    id: "handover",
    name: "Oppdatert_overleveringsnotat.txt",
    type: "txt",
    bytes: new TextEncoder().encode(text).length,
    text,
  });
}
export function reviewSignature(analysis: AnalysisResult, reviews: Reviews) {
  return JSON.stringify([
    analysis.id,
    analysis.findings.map((f) => [
      f.id,
      reviews[f.id]?.decision,
      reviews[f.id]?.comment ?? "",
    ]),
  ]);
}
export function canApproveDraft(
  text: string,
  sourceSignature: string,
  currentSignature: string,
  check: AnalysisResult | null,
  working = false,
) {
  return (
    !working &&
    sourceSignature === currentSignature &&
    !!check &&
    text.trim() === check.documents.handover.text
  );
}
