import { z } from "zod";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 20_000;
// Retain the original two-document text budget, shared across all five slots.
export const MAX_TOTAL_TEXT_LENGTH = 40_000;
export const MAX_PDF_PAGES = 40;
export const documentIds = [
  "agreement",
  "handover",
  "proposal",
  "correspondence",
  "meeting_notes",
] as const;
export const sourceIds = [
  "agreement",
  "proposal",
  "correspondence",
  "meeting_notes",
] as const;
export const supportingIds = [
  "proposal",
  "correspondence",
  "meeting_notes",
] as const;
export type DocumentId = (typeof documentIds)[number];
export type SourceId = (typeof sourceIds)[number];
export const documentLabels: Record<DocumentId, string> = {
  agreement: "Signert kundeavtale",
  handover: "Interne overleveringsnotater",
  proposal: "Tilbud eller salgsforslag",
  correspondence: "Kundekorrespondanse",
  meeting_notes: "Møtenotater eller salgsinformasjon",
};
export const informationLabels = {
  contractual: "Avtaleforpliktelse",
  follow_up: "Opplysning fra salgsfasen",
  conflict: "Kildekonflikt – må avklares",
};
export const classifications = [
  "covered",
  "potentially_missing",
  "needs_clarification",
] as const;
export const categories = [
  "deliverables",
  "deadlines",
  "integrations",
  "training",
  "customer_responsibilities",
  "service",
  "exclusions",
  "implementation",
] as const;
export const classificationLabels = {
  covered: "Dekket",
  potentially_missing: "Potensielt manglende",
  needs_clarification: "Må avklares",
};
export const categoryLabels = {
  deliverables: "Leveranser og funksjonalitet",
  deadlines: "Frister og milepæler",
  integrations: "Integrasjoner",
  training: "Opplæring",
  customer_responsibilities: "Kundens ansvar",
  service: "Tjenestekrav",
  exclusions: "Avgrensninger",
  implementation: "Implementering",
};
export const documentSchema = z
  .object({
    id: z.enum(documentIds),
    documentType: z.enum(documentIds),
    name: z.string().trim().min(1).max(180),
    text: z
      .string()
      .trim()
      .min(20, "Dokumentet må inneholde minst 20 tegn.")
      .max(MAX_TEXT_LENGTH),
    bytes: z.number().int().min(1).max(MAX_FILE_BYTES),
    type: z.enum(["pdf", "txt"]),
  })
  .strict();
const documentSlot = <T extends DocumentId>(id: T) =>
  documentSchema.extend({ id: z.literal(id), documentType: z.literal(id) });
const documentsObject = z
  .object({
    agreement: documentSlot("agreement"),
    handover: documentSlot("handover"),
    proposal: documentSlot("proposal").optional(),
    correspondence: documentSlot("correspondence").optional(),
    meeting_notes: documentSlot("meeting_notes").optional(),
  })
  .strict();
const withinTextBudget = (value: z.infer<typeof documentsObject>) =>
  documentIds.reduce((sum, id) => sum + (value[id]?.text.length ?? 0), 0) <=
  MAX_TOTAL_TEXT_LENGTH;
export const documentsSchema = documentsObject.refine(
  withinTextBudget,
  "Maksimalt 40 000 tegn samlet for alle dokumentene. Ingen tekst avkortes.",
);
export const analyzeRequestSchema = documentsObject
  .extend({ syntheticOnly: z.literal(true) })
  .refine(
    withinTextBudget,
    "Maksimalt 40 000 tegn samlet for alle dokumentene.",
  );
const sourceReferenceSchema = z
  .object({
    documentId: z.enum(sourceIds),
    quote: z.string().trim().min(10).max(1500),
  })
  .strict();
// AI provides interpretation and source quotations, never verification or human decisions.
export const aiFindingSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(5).max(800),
    category: z.enum(categories),
    classification: z.enum(classifications),
    certainty: z.enum(["explicit", "ambiguous"]),
    explanation: z.string().trim().min(10).max(1200),
    sourceDocumentId: z.enum(sourceIds),
    sourceQuote: z.string().trim().min(10).max(1500),
    relatedSources: z.array(sourceReferenceSchema).max(3),
    informationType: z.enum(["contractual", "follow_up", "conflict"]),
    requiresConfirmation: z.boolean(),
    handoverQuote: z.string().trim().min(5).max(1500).nullable(),
  })
  .strict();
export const aiResponseSchema = z
  .object({ findings: z.array(aiFindingSchema).max(40) })
  .strict();
const verification = z.enum(["verified", "unverified"]);
export const evidenceSchema = z
  .object({
    source: verification,
    relatedSources: z.array(verification).max(3),
    handover: z.enum(["verified", "unverified", "not_provided"]),
    status: verification,
  })
  .strict();
export const findingSchema = aiFindingSchema.extend({
  modelClassification: z.enum(classifications),
  id: z.string().min(1),
  sources: z
    .object({
      source: z.enum(sourceIds),
      handover: z.literal("handover").nullable(),
    })
    .strict(),
  evidence: evidenceSchema,
});
export const analysisSchema = z
  .object({
    id: z.string().min(1),
    mode: z.enum(["demo", "live"]),
    model: z.string().min(1),
    createdAt: z.string().datetime(),
    documents: documentsSchema,
    findings: z.array(findingSchema).max(40),
  })
  .strict();
export const reviewSchema = z
  .object({
    decision: z.enum(["unreviewed", "confirmed", "rejected"]),
    comment: z.string().max(1000),
  })
  .strict();
export const reviewsSchema = z.record(z.string(), reviewSchema);
export const sessionSchema = z.object({
  result: analysisSchema,
  reviews: reviewsSchema,
});
export type UploadedDocument = z.infer<typeof documentSchema>;
export type Documents = z.infer<typeof documentsSchema>;
export type AiFinding = z.infer<typeof aiFindingSchema>;
export type AiResponse = z.infer<typeof aiResponseSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type AnalysisResult = z.infer<typeof analysisSchema>;
export type Classification = (typeof classifications)[number];
export type Review = z.infer<typeof reviewSchema>;
export type Reviews = z.infer<typeof reviewsSchema>;
export function listDocuments(
  documents: Partial<Record<DocumentId, UploadedDocument>>,
) {
  return documentIds.flatMap((id) => (documents[id] ? [documents[id]!] : []));
}
