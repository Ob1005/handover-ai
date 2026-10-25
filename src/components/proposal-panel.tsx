"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  FilePenLine,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Button } from "./ui/button";
import { FindingCard } from "./finding-card";
import { TextComparison } from "./text-comparison";
import {
  hasCompleteBaseline,
  isTransferredFollowUp,
  reanalysisInput,
  reanalysisSchema,
  type ReanalysisResult,
} from "@/lib/reanalysis";
import {
  classificationLabels,
  documentsSchema,
  listDocuments,
  MAX_TOTAL_TEXT_LENGTH,
  MAX_TEXT_LENGTH,
  type AnalysisResult,
  type Reviews,
} from "@/lib/schemas";
import {
  canApproveDraft,
  draftDocument,
  proposalSchema,
  reviewSignature,
  type Proposal,
} from "@/lib/proposal";
import { checkDemoProposal, createDemoProposal } from "@/lib/proposal-demo";
import { canGenerateProposal } from "@/lib/review";

type ProposalActivity = "generation" | "verification" | null;
export function ProposalPanel({
  analysis,
  reviews,
  allReviewed,
  syntheticConfirmed,
  activity,
  onActivity,
}: {
  analysis: AnalysisResult;
  reviews: Reviews;
  allReviewed: boolean;
  syntheticConfirmed: boolean;
  activity: ProposalActivity;
  onActivity: (activity: ProposalActivity) => void;
}) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [text, setText] = useState("");
  const [sourceSignature, setSourceSignature] = useState("");
  const [check, setCheck] = useState<ReanalysisResult | null>(null);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const signature = reviewSignature(analysis, reviews);
  const readyForProposal = allReviewed && canGenerateProposal(analysis, reviews);
  const stale = !!proposal && signature !== sourceSignature;
  const working = activity !== null;
  const validText = draftDocumentSafe(text);
  const draftBudget = Math.min(
    MAX_TEXT_LENGTH,
    MAX_TOTAL_TEXT_LENGTH -
      listDocuments(analysis.documents)
        .filter((d) => d.id !== "handover")
        .reduce((sum, d) => sum + d.text.length, 0),
  );
  const withinBudget =
    !!validText &&
    documentsSchema.safeParse({
      ...analysis.documents,
      handover: { ...validText, id: "handover", documentType: "handover" },
    }).success;
  const freshCheck = canApproveDraft(
    text,
    sourceSignature,
    signature,
    check,
    analysis,
  );
  const canApprove = freshCheck && readyForProposal && !working;
  const complete = hasCompleteBaseline(analysis, check);
  const notEvaluated =
    check?.findings.filter((f) => f.evaluationStatus !== "evaluated").length ??
    0;
  const remaining =
    check?.findings.filter((f) => f.classification !== "covered").length ?? 0;
  const transferredFollowUps = check?.findings.filter(isTransferredFollowUp).length ?? 0;
  const unverified =
    check?.findings.filter((f) => f.evidence.status === "unverified").length ??
    0;

  async function request(url: string, body: unknown) {
    controller.current = new AbortController();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([
        controller.current.signal,
        AbortSignal.timeout(70_000),
      ]),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Forespørselen kunne ikke fullføres.");
    return data;
  }
  async function generate() {
    if (
      inFlight.current ||
      !syntheticConfirmed ||
      !readyForProposal ||
      (proposal && !stale)
    )
      return;
    inFlight.current = true;
    onActivity("generation");
    setError("");
    const input = { analysis, reviews, syntheticOnly: true as const };
    const requestedSignature = signature;
    try {
      const next =
        analysis.mode === "demo"
          ? createDemoProposal(input)
          : proposalSchema.parse(
              (await request("/api/proposal", input)).proposal,
            );
      setProposal(next);
      setText(next.text);
      setSourceSignature(requestedSignature);
      setCheck(null);
      setApproved(false);
      setTimeout(() => editor.current?.focus({ preventScroll: true }), 0);
    } catch (e) {
      if (!controller.current?.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Kunne ikke generere forslaget.",
        );
    } finally {
      inFlight.current = false;
      onActivity(null);
    }
  }
  async function verify() {
    if (
      inFlight.current ||
      !proposal ||
      !syntheticConfirmed ||
      !validText ||
      !withinBudget ||
      stale ||
      !readyForProposal ||
      freshCheck
    )
      return;
    inFlight.current = true;
    onActivity("verification");
    setError("");
    setApproved(false);
    const documents = {
      agreement: analysis.documents.agreement,
      handover: { ...validText, id: "handover" as const },
    };
    try {
      const result =
        proposal.mode === "demo"
          ? checkDemoProposal(analysis, documents.handover)
          : reanalysisSchema.parse(
              (
                await request(
                  "/api/reanalyze",
                  reanalysisInput(analysis, documents.handover),
                )
              ).result,
            );
      if (
        result.baselineId !== analysis.id ||
        result.documents.agreement.text !== analysis.documents.agreement.text ||
        result.documents.handover.text !== validText.text
      )
        throw new Error(
          "Kontrollen gjelder en annen tekstversjon. Analyser forslaget på nytt.",
        );
      setCheck(result);
    } catch (e) {
      if (!controller.current?.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Kunne ikke kontrollere forslaget.",
        );
    } finally {
      inFlight.current = false;
      onActivity(null);
    }
  }
  function edit(value: string) {
    setText(value);
    setCheck(null);
    setApproved(false);
    setError("");
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download =
      approved && canApprove
        ? "Godkjent_overleveringsnotat.txt"
        : "Forslag_overleveringsnotat.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!analysis.findings.length || (!readyForProposal && !proposal)) return null;
  return (
    <section className="proposal-section" aria-labelledby="proposal-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow">STEG 04 · GENERER FORSLAG</div>
          <h2 id="proposal-title">Oppdatert overleveringsnotat</h2>
          <p>
            Se gjennom utkastet, kontroller endringene og godkjenn notatet.
          </p>
        </div>
      </div>
      {(!proposal || stale) && (
        <div className="proposal-action">
          <div>
            <strong>
              {readyForProposal ? "Klar for et nytt utkast" : "Vurderingene er endret"}
            </strong>
            <p>
              Bygger på bekreftede funn og kommentarene dine. Avviste funn rettes ikke automatisk.
            </p>
          </div>
          <Button
            onClick={generate}
            disabled={
              working ||
              !syntheticConfirmed ||
              !readyForProposal ||
              (!!proposal && !stale)
            }
          >
            {activity === "generation" ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <FilePenLine size={16} />
          )}
            {activity === "generation"
              ? "Lager forslag …"
              : proposal
                ? "Oppdater forslag"
                : "Generer forslag"}
        </Button>
      </div>
      )}
      {error && (
        <p className="proposal-error" role="alert">
          <TriangleAlert size={16} />
          {error}
        </p>
      )}
      {activity === "generation" && (
        <p role="status" className="proposal-note">
          Lager utkast fra dokumentene og vurderingene dine. Det kan ta opptil ett minutt.
        </p>
      )}
      {!syntheticConfirmed && (
        <p className="proposal-note">
          Bekreft øverst at dokumentene er syntetiske for å fortsette.
        </p>
      )}
      {proposal && (
        <>
          <div className={`analysis-origin ${proposal.mode}`}>
            <span>
              <Sparkles size={15} />
              <strong>
                {proposal.mode === "demo"
                  ? "Demoforslag · ingen AI-forespørsel"
                  : `AI-generert forslag · ${proposal.model}`}
              </strong>
            </span>
            <span>
              {approved && canApprove
                ? "Godkjent av deg"
                : "Utkast"}
            </span>
          </div>
          {stale && (
            <p className="proposal-error" role="status">
              Vurderingene eller kommentarene er endret. Fullfør nødvendige vurderinger og velg
              «Oppdater forslag» før ny kontroll og godkjenning.
            </p>
          )}
          <div className="proposal-grid">
            <div className="proposal-editor">
              <label htmlFor="proposal-text">
                Rediger utkastet{" "}
                <span>Endringer må kontrolleres på nytt før godkjenning.</span>
              </label>
              <textarea
                id="proposal-text"
                ref={editor}
                value={text}
                onChange={(e) => edit(e.target.value)}
                maxLength={MAX_TEXT_LENGTH}
                disabled={working}
                rows={16}
              />
              <div className="proposal-editor-footer">
                <span>
                  {text.length.toLocaleString("nb-NO")} /{" "}
                  {draftBudget.toLocaleString("nb-NO")} tegn
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={working || text === proposal.text}
                  onClick={() => edit(proposal.text)}
                >
                  <RotateCcw size={13} />
                  Tilbakestill utkast
                </Button>
              </div>
              {(!validText || !withinBudget) && (
                <p className="proposal-error" role="status">
                  Notatet må inneholde mellom 20 og{" "}
                  {draftBudget.toLocaleString("nb-NO")} tegn for å holde seg innenfor den samlede tekstgrensen.
                </p>
              )}
            </div>
            <aside
              className="proposal-changes"
              aria-label="Oppfølging og endringsoversikt"
            >
              {proposal.followUps.length > 0 && (
                <>
                  <h3>Oppfølgingspunkter fra {proposal.mode === "demo" ? "demoen" : "AI"}</h3>
                  <p className="proposal-note">
                    Punktene ble tatt med i det genererte notatet.
                    Oversikten oppdateres ikke når du redigerer; sluttkontrollen vurderer teksten du har nå.
                  </p>
                  <ul>
                    {proposal.followUps.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </>
              )}
              <details className="proposal-change-summary">
                <summary>Endringsoversikt fra {proposal.mode === "demo" ? "demoen" : "AI"}</summary>
                <p className="proposal-note">
                  Gjelder det genererte utkastet. Bruk tekstsammenligningen for å se alle endringer, også dine egne.
                </p>
                {proposal.changes.length ? (
                  <ul>
                    {proposal.changes.map((change, i) => (
                      <li key={`${change.findingId}-${i}`}>
                        <strong>
                          {
                            analysis.findings.find(
                              (f) => f.id === change.findingId,
                            )?.title
                          }
                        </strong>
                        <p>{change.summary}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Ingen konkrete endringer foreslått.</p>
                )}
              </details>
            </aside>
          </div>
          <TextComparison
            original={analysis.documents.handover.text}
            draft={text}
          />
          <details className="proposal-original">
            <summary>Opprinnelig overleveringsnotat</summary>
            <pre>{analysis.documents.handover.text}</pre>
          </details>
          <div className="proposal-buttons">
            <Button
              onClick={verify}
              disabled={
                working ||
                !syntheticConfirmed ||
                !validText ||
                !withinBudget ||
                stale ||
                !readyForProposal ||
                freshCheck
              }
            >
              {activity === "verification" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              {activity === "verification"
                ? "Kontrollerer forslaget …"
                : freshCheck
                  ? "Utkastet er kontrollert"
                  : "Kontroller utkastet"}
            </Button>
            <Button
              variant="outline"
              onClick={download}
              disabled={working || !validText}
            >
              <ArrowDownToLine size={15} />
              Last ned {approved && canApprove ? "godkjent notat" : "forslag"}
            </Button>
          </div>
          <p className="proposal-note">
            Kontrollen bruker alle opprinnelige funn. Endrer du tekst eller vurderinger, må du kontrollere på nytt.
          </p>
          {activity === "verification" && (
            <p role="status" className="proposal-note">
              Kontrollerer alle opprinnelige funn mot utkastet.
            </p>
          )}
          {check && (
            <div className="proposal-check">
              <div className="section-heading">
                <div>
                  <h3>Sluttkontroll</h3>
                  <p>
                    {check.mode === "demo"
                      ? "Demokontroll uten API-kall. Egne omskrivinger må kontrolleres manuelt eller med AI."
                      : `AI-kontroll · ${check.model}`}
                  </p>
                </div>
                <span className="unresolved">
                  {remaining === 0 ? "Ingen mangler flagget" : `${remaining} krever gjennomgang`}
                </span>
              </div>
              <p className="proposal-note">
                {analysis.findings.length - notEvaluated} av{" "}
                {analysis.findings.length} opprinnelige funn kontrollert ·{" "}
                {check.findings.length - remaining} dekket
                {transferredFollowUps > 0 && `, ${transferredFollowUps} med oppfølging`}
                {unverified > 0 && ` · ${unverified} med uverifiserte sitater`}.
                {check.findings.length === 0 &&
                  " Ingen krav identifisert. Kontroller dokumentene manuelt."}
              </p>
              {!complete && (
                <p className="proposal-error" role="alert">
                  {notEvaluated
                    ? `${notEvaluated} opprinnelige funn mangler en entydig vurdering.`
                    : "Kontrollen dekker ikke hele det opprinnelige kildegrunnlaget."}{" "}
                  Kjør kontrollen på nytt før du godkjenner.
                </p>
              )}
              {check.findings.map((finding, i) => (
                <div key={finding.id} className="baseline-finding">
                  <p className="proposal-note">
                    Før:{" "}
                    {
                      classificationLabels[
                        analysis.findings.find((f) => f.id === finding.id)
                          ?.classification ?? "needs_clarification"
                      ]
                    }{" "}
                    · Nå:{" "}
                    {isTransferredFollowUp(finding)
                      ? "Overført med oppfølging"
                      : classificationLabels[finding.classification]}
                    {finding.evaluationStatus === "not_evaluated" &&
                      " · Ikke vurdert. Godkjenning er sperret."}
                  </p>
                  <FindingCard
                    key={`${check.id}-${finding.id}`}
                    finding={finding}
                    index={i}
                    documents={check.documents}
                    readOnly
                    transferredFollowUp={isTransferredFollowUp(finding)}
                    coveredAgreement={finding.classification === "covered" && finding.coverageBasis === "agreement_requirement"}
                  />
                </div>
              ))}
              <div className="proposal-approval">
                <div>
                  <strong>
                    {approved && canApprove
                      ? "Notatet er godkjent av deg"
                      : "Godkjenn overleveringsnotatet"}
                  </strong>
                  <p>
                    {!complete
                      ? "Alle opprinnelige funn må være kontrollert før du kan godkjenne."
                      : remaining
                        ? `${remaining} mulige mangler eller avklaringer gjenstår. Se gjennom dem før du godkjenner.`
                        : transferredFollowUps > 0
                          ? "Ingen mangler flagget. Åpne saker må fortsatt følges opp av leveringsteamet."
                          : "Ingen mangler flagget. Kontroller innholdet før du godkjenner."}{" "}
                    Du godkjenner det interne notatet, ikke nye avtalevilkår.
                  </p>
                </div>
                <Button
                  disabled={!canApprove || approved}
                  onClick={() => {
                    if (canApprove) setApproved(true);
                  }}
                >
                  <Check size={16} />
                  {approved && canApprove ? "Godkjent" : "Godkjenn notatet"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
function draftDocumentSafe(text: string) {
  try {
    return draftDocument(text);
  } catch {
    return null;
  }
}
