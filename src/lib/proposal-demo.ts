import { demoResponse } from "./demo";
import { createAnalysis, quoteExists } from "./evidence";
import {
  createProposal,
  proposalRequestSchema,
  type ProposalContent,
  type ProposalRequest,
} from "./proposal";
import type { Documents } from "./schemas";

export function createDemoProposal(input: ProposalRequest) {
  const { analysis, reviews } = proposalRequestSchema.parse(input);
  if (analysis.mode !== "demo")
    throw new Error("Demoforslag krever en demoanalyse.");
  let text = analysis.documents.handover.text;
  const changes: ProposalContent["changes"] = [];
  const followUps: string[] = [];
  for (const finding of analysis.findings) {
    const review = reviews[finding.id];
    if (review.comment.trim())
      followUps.push(
        `Kommentar til «${finding.title}»: ${review.comment.trim()}`,
      );
    if (review.decision !== "confirmed" || finding.classification === "covered")
      continue;
    if (
      finding.certainty === "ambiguous" ||
      !quoteExists(finding.agreementQuote, analysis.documents.agreement.text)
    ) {
      followUps.push(
        `Avklar «${finding.title}» manuelt før opplysningene legges inn som sikre forpliktelser.`,
      );
      continue;
    }
    const previous = text;
    if (finding.handoverQuote && text.includes(finding.handoverQuote))
      text = text.replace(finding.handoverQuote, finding.agreementQuote);
    else if (!quoteExists(finding.agreementQuote, text))
      text += `\n${finding.agreementQuote}`;
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
export function checkDemoProposal(documents: Documents) {
  const text = documents.handover.text;
  const findings = demoResponse.findings.map((f) => {
    const agreementPresent = quoteExists(f.agreementQuote, text);
    const originalPresent =
      !!f.handoverQuote && quoteExists(f.handoverQuote, text);
    const conflictingDate = f.category === "deadlines" && originalPresent;
    const covered =
      !conflictingDate &&
      (agreementPresent || (f.classification === "covered" && originalPresent));
    return {
      ...f,
      classification: covered
        ? ("covered" as const)
        : conflictingDate
          ? ("needs_clarification" as const)
          : ("potentially_missing" as const),
      handoverQuote: agreementPresent
        ? f.agreementQuote
        : originalPresent
          ? f.handoverQuote
          : null,
      explanation: covered
        ? "Demokontrollen fant et kjent avtaleutdrag eller en forhåndsvalidert formulering i forslaget."
        : conflictingDate
          ? "Den opprinnelige, motstridende datoen finnes fortsatt i forslaget."
          : "Demokontrollen fant ikke den kjente formuleringen. Omskrevet innhold må undersøkes med live AI eller manuelt.",
    };
  });
  return createAnalysis(
    { findings },
    documents,
    "demo",
    "Regelbasert demokontroll",
  );
}
