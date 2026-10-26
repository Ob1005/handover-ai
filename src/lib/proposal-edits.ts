import { z } from "zod";
import { quoteExists } from "./evidence";
import {
  createProposal,
  proposalContext,
  proposalRequestSchema,
  type ProposalRequest,
} from "./proposal";

export const proposalEditsSchema = z.object({
  updates: z.array(z.object({
    findingId: z.string().min(1).max(100),
    text: z.string().trim().min(5).max(3000),
    summary: z.string().trim().min(5).max(600),
  }).strict()).max(40),
  followUps: z.array(z.string().trim().min(5).max(1200)).max(40),
}).strict();

// Match the verified quote back to its exact original span. Whitespace may
// differ in PDF extraction, but ambiguous/repeated targets must not be guessed.
function uniqueSpan(text: string, quote: string) {
  const pattern = quote.trim().split(/\s+/u)
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const matches = [...text.matchAll(new RegExp(pattern, "gu"))];
  return matches.length === 1
    ? { start: matches[0].index!, end: matches[0].index! + matches[0][0].length,
        originalText: matches[0][0] }
    : null;
}

function prepareEdits(input: ProposalRequest) {
  const source = proposalRequestSchema.parse(input);
  const context = proposalContext(source);
  const text = source.analysis.documents.handover.text;
  const targets = new Map<string, ReturnType<typeof uniqueSpan> | "append">();
  for (const finding of context.findings) {
    if (finding.classification === "covered" || finding.review.decision !== "confirmed" ||
      !finding.sourceQuoteVerified || finding.relatedSources.some(ref => !ref.verified)) continue;
    if (finding.handoverQuote === null) targets.set(finding.id, "append");
    else if (finding.handoverQuoteVerified) {
      const span = uniqueSpan(text, finding.handoverQuote);
      if (span) targets.set(finding.id, span);
    }
  }
  return {
    source, targets,
    context: {
      ...context,
      findings: context.findings.map(finding => {
        const target = targets.get(finding.id);
        return { ...finding, editTarget: target === "append"
          ? { operation: "append", originalText: null }
          : target ? { operation: "replace", originalText: target.originalText } : null };
      }),
    },
  };
}

export function proposalEditContext(input: ProposalRequest) {
  return prepareEdits(input).context;
}

export function createEditedProposal(
  content: z.input<typeof proposalEditsSchema>, input: ProposalRequest, model: string,
) {
  const parsed = proposalEditsSchema.parse(content);
  const { source, targets } = prepareEdits(input);
  const seen = new Set<string>();
  const replacements: { start: number; end: number; text: string }[] = [];
  const additions: string[] = [];
  for (const update of parsed.updates) {
    const target = targets.get(update.findingId);
    if (!target || seen.has(update.findingId))
      throw new Error("Rettelsen gjelder et utilgjengelig, dekket, avvist eller gjentatt funn.");
    seen.add(update.findingId);
    if (target === "append") additions.push(update.text);
    else replacements.push({ start: target.start, end: target.end, text: update.text });
  }
  replacements.sort((a, b) => a.start - b.start);
  if (replacements.some((item, i) => i > 0 && item.start < replacements[i - 1].end))
    throw new Error("Rettelsene overlapper. Ingen endringer er tatt i bruk.");
  let text = source.analysis.documents.handover.text;
  for (const replacement of [...replacements].reverse()) {
    text = text.slice(0, replacement.start) + replacement.text + text.slice(replacement.end);
  }
  // Even a verified target may contain another, independently covered point.
  // Do not allow its removal as a side effect of a neighbouring correction.
  for (const finding of source.analysis.findings) {
    if ((finding.classification === "covered" || source.reviews[finding.id]?.decision === "rejected") &&
      finding.handoverQuote && quoteExists(finding.handoverQuote, source.analysis.documents.handover.text) &&
      !quoteExists(finding.handoverQuote, text))
      throw new Error("Rettelsen fjerner et dekket eller avvist punkt. Ingen endringer er tatt i bruk.");
  }
  if (additions.length) text += `\n\nTILLEGG FRA GJENNOMGANGEN\n${additions.join("\n\n")}`;
  return createProposal({
    text,
    changes: parsed.updates.map(({ findingId, summary }) => ({ findingId, summary })),
    followUps: parsed.followUps,
  }, source, "live", model);
}
