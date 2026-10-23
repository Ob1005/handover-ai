import { quoteExists } from "./evidence";
import {
  createProposal,
  proposalRequestSchema,
  type ProposalContent,
  type ProposalRequest,
} from "./proposal";
import {
  type AnalysisResult,
  type Finding,
  type UploadedDocument,
  documentLabels,
} from "./schemas";
import { createReanalysis, reanalysisInput } from "./reanalysis";

function followUpLine(finding: Finding) {
  const sources = [
    `${documentLabels[finding.sourceDocumentId]}: «${finding.sourceQuote}»`,
    ...finding.relatedSources.map(
      (ref) => `${documentLabels[ref.documentId]}: «${ref.quote}»`,
    ),
  ];
  return `Avklar «${finding.title}». ${sources.join(". ")}. Punktet er åpent og endrer ikke avtalen.`;
}

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
        `Avklar «${finding.title}» manuelt. Sitatet finnes ikke i kilden, så opplysningen er ikke lagt til.`,
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
      followUps.push(followUpLine(finding));
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
        summary: `Oppdatert «${finding.title}» med tekst fra avtalen.`,
      });
  }
  if (followUps.length)
    text += `\n\nÅPNE PUNKTER FOR PROSJEKTLEDER\n${followUps.join("\n\n")}`;
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
    const knownFollowUp = followUpLine(f);
    const followUpDocumented = text.includes(knownFollowUp);
    const covered = followUpDocumented || (
      !conflictingDate &&
      (agreementPresent || (f.classification === "covered" && originalPresent)));
    return {
      findingId: f.id,
      coverageBasis: followUpDocumented ? "documented_follow_up" as const
        : covered ? "agreement_requirement" as const : "insufficient" as const,
      classification: covered
        ? ("covered" as const)
        : conflictingDate
          ? ("needs_clarification" as const)
          : ("potentially_missing" as const),
      handoverQuote: followUpDocumented
        ? knownFollowUp
        : agreementPresent
        ? f.sourceQuote
        : originalPresent
          ? f.handoverQuote
          : null,
      explanation: followUpDocumented
        ? "Den åpne saken og kildene er med i notatet. Prosjektleder må fortsatt følge opp."
        : covered
        ? "Punktet er med i forslaget. Demoen kjenner igjen ordlyden."
        : conflictingDate
          ? "Forslaget inneholder fortsatt datoen som er i strid med avtalen."
          : "Demoen kjenner ikke igjen formuleringen. Kontroller manuelt, eller analyser den med AI.",
    };
  });
  return createReanalysis(
    input,
    { findings },
    "demo",
    "Regelbasert demokontroll",
  );
}
