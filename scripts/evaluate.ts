import { mkdir, writeFile } from "node:fs/promises";
import { dataset } from "../evaluation/dataset";
import { scoreCase } from "../evaluation/score";
import { analyzeDocuments, getModel } from "../src/lib/server/gemini";
import { AppError } from "../src/lib/errors";

async function main() {
  if (!process.argv.includes("--live"))
    throw new Error(
      "Live-evaluering bruker faktisk Gemini-kvote. Kjør pnpm evaluate --live. Ingen forhåndsberegnede svar brukes.",
    );
  if (!process.env.GEMINI_API_KEY?.trim())
    throw new Error("GEMINI_API_KEY mangler. Ingen evaluering er utført.");
  const selectedId = process.argv
    .find((a) => a.startsWith("--case="))
    ?.slice(7);
  const selected = selectedId
    ? dataset.filter((c) => c.id === selectedId)
    : dataset;
  if (!selected.length) throw new Error("Ukjent testtilfelle.");
  const results = [];
  const errors = [];
  for (let i = 0; i < selected.length; i++) {
    const testCase = selected[i];
    console.log(`Analyserer ${testCase.id} (${i + 1}/${selected.length}) …`);
    try {
      const analysis = await analyzeDocuments(testCase.documents);
      results.push({ ...scoreCase(testCase, analysis.findings), analysis });
      console.log(`Validert svar: ${analysis.findings.length} funn.`);
    } catch (error) {
      errors.push({
        id: testCase.id,
        error: error instanceof Error ? error.message : "Ukjent feil",
      });
      console.log(error instanceof Error ? error.message : "Ukjent feil");
      if (
        error instanceof AppError &&
        [
          "PROVIDER_RATE_LIMIT",
          "PROVIDER_UNAVAILABLE",
          "TIMEOUT",
          "PROVIDER_AUTH",
          "PROVIDER_REQUEST",
          "NOT_CONFIGURED",
        ].includes(error.code)
      ) {
        console.log(
          "Stopper kjøringen for å unngå gjentatte forespørsler med samme tilgangs- eller kvotefeil.",
        );
        break;
      }
    }
    // Sequential requests and a pause reduce quota pressure; no automatic retry or fallback.
    if (i < selected.length - 1)
      await new Promise((resolve) => setTimeout(resolve, 13_000));
  }
  const totals = results.reduce(
    (t, r) => ({
      correct: t.correct + r.correct,
      denominator: t.denominator + r.expectedCount + r.extraFindings,
      correctlyIdentifiedOmissions:
        t.correctlyIdentifiedOmissions + r.correctlyIdentifiedOmissions,
      missedOmissions: t.missedOmissions + r.missedOmissions,
      falsePositiveFindings: t.falsePositiveFindings + r.falsePositiveFindings,
    }),
    {
      correct: 0,
      denominator: 0,
      correctlyIdentifiedOmissions: 0,
      missedOmissions: 0,
      falsePositiveFindings: 0,
    },
  );
  const report = {
    mode: "live",
    model: getModel(),
    timestamp: new Date().toISOString(),
    selected: selected.length,
    attempted: results.length + errors.length,
    notAttempted: selected.length - results.length - errors.length,
    completed: results.length,
    failed: errors.length,
    metricsForSuccessfulCasesOnly: {
      ...totals,
      classificationAccuracy: totals.denominator
        ? totals.correct / totals.denominator
        : null,
    },
    errors,
    results,
  };
  await mkdir("evaluation-results", { recursive: true });
  const path = `evaluation-results/live-${Date.now()}.json`;
  await writeFile(path, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        report: path,
        completed: report.completed,
        failed: report.failed,
        metrics: report.metricsForSuccessfulCasesOnly,
      },
      null,
      2,
    ),
  );
  if (errors.length) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
