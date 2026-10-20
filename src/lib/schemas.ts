import { z } from "zod";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 20_000;
export const MAX_PDF_PAGES = 40;
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
    id: z.enum(["agreement", "handover"]),
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
export const documentsSchema = z
  .object({
    agreement: documentSchema.extend({ id: z.literal("agreement") }),
    handover: documentSchema.extend({ id: z.literal("handover") }),
  })
  .strict();
export const analyzeRequestSchema = documentsSchema.extend({
  syntheticOnly: z.literal(true),
});

// AI owns only interpretation and quotes. It cannot set IDs, verification, or review.
export const aiFindingSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(5).max(800),
    category: z.enum(categories),
    classification: z.enum(classifications),
    certainty: z.enum(["explicit", "ambiguous"]),
    explanation: z.string().trim().min(10).max(1200),
    agreementQuote: z.string().trim().min(10).max(1500),
    handoverQuote: z.string().trim().min(5).max(1500).nullable(),
  })
  .strict();
export const aiResponseSchema = z
  .object({ findings: z.array(aiFindingSchema).max(40) })
  .strict();
export const evidenceSchema = z
  .object({
    agreement: z.enum(["verified", "unverified"]),
    handover: z.enum(["verified", "unverified", "not_provided"]),
    status: z.enum(["verified", "unverified"]),
  })
  .strict();
export const findingSchema = aiFindingSchema.extend({
  modelClassification: z.enum(classifications),
  id: z.string().min(1),
  sources: z
    .object({
      agreement: z.literal("agreement"),
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
