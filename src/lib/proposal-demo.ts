import { quoteExists } from "./evidence";
import {
  createProposal,
  proposalRequestSchema,
  type ProposalContent,
  type ProposalRequest,
} from "./proposal";
import type { AnalysisResult, UploadedDocument } from "./schemas";
import { createReanalysis, reanalysisInput } from "./reanalysis";

export function createDemoProposal(input: ProposalRequest) {
  const { analysis, reviews } = proposalRequestSchema.parse(input);
  if (analysis.mode !== "demo")
    throw new Error("Demoforslag krever en demoanalyse.");
  let text = analysis.documents.handover.text;
  const changes: ProposalContent["changes"] = [];
  const followUps: string[] = [];
  for (const finding of analysis.findings) {
    const review = reviews[finding.id] ?? { decision: "unreviewed", comment: "" };
    if (review.comment.trim())
      followUps.push(
        `Kommentar til «${finding.title}»: ${review.comment.trim()}`,
      );
    if (review.decision !== "confirmed" || finding.classification === "covered")
      continue;
    if (
      !quoteExists(
        finding.sourceQuote,
        analysis.documents[finding.sourceDocumentId]?.text ?? "",
      )
    ) {
      followUps.push(
        `Avklar «${finding.title}» manuelt. Kildesitatet kunne ikke verifiseres og er ikke lagt til som et faktum.`,
      );
      continue;
    }
    if (
      finding.informationType !== "contractual" ||
      finding.requiresConfirmation ||
      finding.certainty === "ambiguous" ||
      !quoteExists(
        finding.sourceQuote,
        analysis.documents[finding.sourceDocumentId]?.text ?? "",
      )
    ) {
      followUps.push(
        `Avklar «${finding.title}» (${finding.sourceDocumentId}): «${finding.sourceQuote}»${finding.relatedSources.map((ref) => ` [${ref.documentId}: ${ref.quote}]`).join("")}. Ikke et nytt bekreftet avtalevilkår.`,
      );
      continue;
    }
    const previous = text;
    if (finding.handoverQuote && text.includes(finding.handoverQuote))
      text = text.replace(finding.handoverQuote, finding.sourceQuote);
    else if (!quoteExists(finding.sourceQuote, text))
      text += `\n${finding.sourceQuote}`;
    if (text !== previous)
      changes.push({
        findingId: finding.id,
        summary: `Oppdatert «${finding.title}» med den verifiserte avtaleteksten.`,
      });
  }
  if (followUps.length)
    text += `\n\nREVIEWERNOTATER – MÅ KONTROLLERES\n${followUps.join("\n")}`;
  return createProposal(
    { text, changes, followUps },
    input,
    "demo",
    "Regelbasert demo · ingen AI-forespørsel",
  );
}

// Limited to the known synthetic example. It checks known quotations, not general semantics.
export function checkDemoProposal(
  baseline: AnalysisResult,
  handover: UploadedDocument,
) {
  const input = reanalysisInput(baseline, handover);
  if (baseline.mode !== "demo")
    throw new Error("Demokontroll krever en demoanalyse.");
  const text = input.handover.text;
  const findings = baseline.findings.map((f) => {
    const agreementPresent = quoteExists(f.sourceQuote, text);
    const originalPresent =
      !!f.handoverQuote && quoteExists(f.handoverQuote, text);
    const conflictingDate = f.category === "deadlines" && originalPresent;
    // Recognise only the full, known demo follow-up line, including all sources
    // and the qualification that this is not a new contractual commitment.
    const followUpLine = `Avklar «${f.title}» (${f.sourceDocumentId}): «${f.sourceQuote}»${f.relatedSources.map((ref) => ` [${ref.documentId}: ${ref.quote}]`).join("")}. Ikke et nytt bekreftet avtalevilkår.`;
    const followUpDocumented = text.includes(followUpLine);
    const covered = followUpDocumented || (
      !conflictingDate &&
      (agreementPresent || (f.classification === "covered" && originalPresent)));
    return {
      findingId: f.id,
      followUpDocumented,
      classification: covered
        ? ("covered" as const)
        : conflictingDate
          ? ("needs_clarification" as const)
          : ("potentially_missing" as const),
      handoverQuote: followUpDocumented
        ? followUpLine
        : agreementPresent
        ? f.sourceQuote
        : originalPresent
          ? f.handoverQuote
          : null,
      explanation: followUpDocumented
        ? "Den åpne saken og kildene er overført som oppfølging, uten å bli et nytt avtalevilkår. Saken er fortsatt ikke avklart."
        : covered
        ? "Demokontrollen fant et kjent avtaleutdrag eller en forhåndsvalidert formulering i forslaget."
        : conflictingDate
          ? "Den opprinnelige, motstridende datoen finnes fortsatt i forslaget."
          : "Demokontrollen fant ikke den kjente formuleringen. Omskrevet innhold må undersøkes med live AI eller manuelt.",
    };
  });
  return createReanalysis(
    input,
    { findings },
    "demo",
    "Regelbasert demokontroll",
  );
}
