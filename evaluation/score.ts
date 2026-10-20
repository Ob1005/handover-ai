import type { Finding } from "../src/lib/schemas";
import { normalizeWhitespace } from "../src/lib/evidence";
import type { EvaluationCase } from "./dataset";

// Deterministic, one-to-one source-anchor matching. No second LLM grades the first.
// Partial overlap can be missed; inspect unmatched findings in the saved report.
export function scoreCase(testCase: EvaluationCase, findings: Finding[]) {
  const remaining = new Set(findings.map((_, i) => i));
  const matches = testCase.expected.map((expected) => {
    const anchor = normalizeWhitespace(expected.anchor);
    const index = [...remaining].find((i) => {
      const quote = normalizeWhitespace(findings[i].agreementQuote);
      return (
        findings[i].evidence.agreement === "verified" &&
        findings[i].category === expected.category &&
        (quote.includes(anchor) ||
          (quote.length >= 15 && anchor.includes(quote)))
      );
    });
    if (index !== undefined) remaining.delete(index);
    return { expected, actual: index === undefined ? null : findings[index] };
  });
  const correct = matches.filter(
    (m) => m.actual?.classification === m.expected.classification,
  ).length;
  const expectedOmissions = matches.filter(
    (m) => m.expected.classification === "potentially_missing",
  );
  const correctlyIdentifiedOmissions = expectedOmissions.filter(
    (m) => m.actual?.classification === "potentially_missing",
  ).length;
  const missedOmissions =
    expectedOmissions.length - correctlyIdentifiedOmissions;
  const falsePositiveFindings =
    [...remaining].filter((i) => findings[i].classification !== "covered")
      .length +
    matches.filter(
      (m) =>
        m.actual &&
        m.actual.classification !== "covered" &&
        m.expected.classification === "covered",
    ).length;
  return {
    id: testCase.id,
    correct,
    expectedCount: testCase.expected.length,
    extraFindings: remaining.size,
    correctlyIdentifiedOmissions,
    missedOmissions,
    falsePositiveFindings,
    classificationAccuracy:
      testCase.expected.length + remaining.size
        ? correct / (testCase.expected.length + remaining.size)
        : null,
    matches,
    unmatchedFindings: [...remaining].map((i) => findings[i]),
  };
}
