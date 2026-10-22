import {
  reviewsSchema,
  sessionSchema,
  type AnalysisResult,
  type Finding,
  type Review,
  type Reviews,
  type UploadedDocument,
  type DocumentId,
} from "./schemas";
export const SESSION_KEY = "handover-ai-session-v1";
export type WorkflowActivity =
  DocumentId | "analysis" | "verification" | "generation" | null;
export function getWorkflowStep(
  documents: Partial<Record<DocumentId, UploadedDocument>>,
  busy: WorkflowActivity,
  result: AnalysisResult | null,
  reviews: Reviews,
): 1 | 2 | 3 | 4 {
  if (busy === "analysis") return 2;
  if (busy === "generation" || busy === "verification") return 4;
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
export function requiresReview(finding: Pick<Finding, "classification">) {
  return finding.classification !== "covered";
}
export function reviewProgress(findings: Finding[], reviews: Reviews) {
  const required = findings.filter(requiresReview);
  const reviewed = required.filter(
    (f) =>
      reviews[f.id]?.decision === "confirmed" ||
      reviews[f.id]?.decision === "rejected",
  ).length;
  return {
    reviewed,
    unresolved: required.length - reviewed,
    total: required.length,
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
