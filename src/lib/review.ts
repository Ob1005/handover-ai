import {
  reviewsSchema,
  sessionSchema,
  type AnalysisResult,
  type Finding,
  type Review,
  type Reviews,
  type UploadedDocument,
} from "./schemas";
export const SESSION_KEY = "handover-ai-session-v1";
export type WorkflowActivity =
  "agreement" | "handover" | "analysis" | "proposal" | "verification" | null;
export function getWorkflowStep(
  documents: Partial<Record<"agreement" | "handover", UploadedDocument>>,
  busy: WorkflowActivity,
  result: AnalysisResult | null,
  reviews: Reviews,
): 1 | 2 | 3 | 4 {
  if (busy === "analysis") return 2;
  if (busy === "proposal" || busy === "verification") return 4;
  if (busy) return 1;
  if (result)
    return reviewProgress(result.findings, reviews).unresolved === 0 ? 4 : 3;
  return documents.agreement && documents.handover ? 2 : 1;
}
export function updateReview(
  reviews: Reviews,
  findingId: string,
  change: Partial<Review>,
): Reviews {
  return reviewsSchema.parse({
    ...reviews,
    [findingId]: {
      ...(reviews[findingId] ?? { decision: "unreviewed", comment: "" }),
      ...change,
    },
  });
}
export function reviewProgress(findings: Finding[], reviews: Reviews) {
  const reviewed = findings.filter(
    (f) =>
      reviews[f.id]?.decision === "confirmed" ||
      reviews[f.id]?.decision === "rejected",
  ).length;
  return {
    reviewed,
    unresolved: findings.length - reviewed,
    total: findings.length,
  };
}
export function parseSession(value: string | null) {
  if (!value) return null;
  try {
    return sessionSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
export function serializeSession(result: AnalysisResult, reviews: Reviews) {
  return JSON.stringify(sessionSchema.parse({ result, reviews }));
}
