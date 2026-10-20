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
import {
  analysisSchema,
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

type ProposalActivity = "proposal" | "verification" | null;
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
  const [check, setCheck] = useState<AnalysisResult | null>(null);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const signature = reviewSignature(analysis, reviews);
  const stale = !!proposal && signature !== sourceSignature;
  const working = activity !== null;
  const validText = draftDocumentSafe(text);
  const freshCheck = canApproveDraft(text, sourceSignature, signature, check);
  const canApprove = freshCheck && allReviewed && !working;
  const remaining =
    check?.findings.filter((f) => f.classification !== "covered").length ?? 0;
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
      !allReviewed ||
      (proposal && !stale)
    )
      return;
    inFlight.current = true;
    onActivity("proposal");
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
      stale ||
      !allReviewed ||
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
          ? checkDemoProposal(documents)
          : analysisSchema.parse(
              (
                await request("/api/analyze", {
                  ...documents,
                  syntheticOnly: true,
                })
              ).result,
            );
      if (
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

  if (!allReviewed && !proposal) return null;
  return (
    <section className="proposal-section" aria-labelledby="proposal-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow">STEG 04 · GENERER FORSLAG</div>
          <h2 id="proposal-title">Forslag til oppdatert overleveringsnotat</h2>
          <p>
            Bruk vurderingene dine til å utarbeide et nytt notat. Kundeavtalen
            beholdes uendret.
          </p>
        </div>
      </div>
      <div className="proposal-action">
        <div>
          <strong>
            {allReviewed ? "Alle funn er vurdert" : "Vurderingene er endret"}
          </strong>
          <p>
            Bekreftede funn og kommentarer tas med som grunnlag. Avviste funn
            skal ikke føre til automatiske rettelser.
          </p>
        </div>
        <Button
          onClick={generate}
          disabled={
            working ||
            !syntheticConfirmed ||
            !allReviewed ||
            (!!proposal && !stale)
          }
        >
          {activity === "proposal" ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <FilePenLine size={16} />
          )}
          {activity === "proposal" ? "Lager forslag …" : "Oppdater forslag"}
        </Button>
      </div>
      {error && (
        <p className="proposal-error" role="alert">
          <TriangleAlert size={16} />
          {error}
        </p>
      )}
      {activity === "proposal" && (
        <p role="status" className="proposal-note">
          AI utarbeider et utkast fra dokumentene og vurderingene. Dette kan ta
          opptil 60 sekunder.
        </p>
      )}
      {!syntheticConfirmed && (
        <p className="proposal-note">
          Bekreft øverst at dokumentene er syntetiske før du genererer eller
          analyserer forslaget.
        </p>
      )}
      {proposal && (
        <>
          <div className={`analysis-origin ${proposal.mode}`}>
            <span>
              <Sparkles size={15} />
              <strong>
                {proposal.mode === "demo"
                  ? "Demo · regelbasert forslag, ingen AI-forespørsel"
                  : `AI-generert forslag · ${proposal.model}`}
              </strong>
            </span>
            <span>
              {approved && canApprove
                ? "Godkjent av reviewer"
                : "Utkast · ikke godkjent"}
            </span>
          </div>
          {stale && (
            <p className="proposal-error" role="status">
              Vurderinger eller kommentarer er endret etter at forslaget ble
              laget. Vurder alle funn og trykk «Oppdater forslag» igjen før ny
              kontroll og godkjenning.
            </p>
          )}
          <div className="proposal-grid">
            <div className="proposal-editor">
              <label htmlFor="proposal-text">
                Oppdatert overleveringsnotat{" "}
                <span>Du kan redigere teksten før kontroll.</span>
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
                <span>{text.length.toLocaleString("nb-NO")} / 20 000 tegn</span>
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
              {!validText && (
                <p className="proposal-error" role="status">
                  Forslaget må inneholde minst 20 og maksimalt 20 000 tegn for å
                  kunne kontrolleres.
                </p>
              )}
            </div>
            <aside
              className="proposal-changes"
              aria-label="Foreslåtte endringer"
            >
              <h3>Foreslåtte endringer</h3>
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
                <p>
                  Ingen konkrete endringer foreslått ut fra de bekreftede
                  funnene.
                </p>
              )}
              {proposal.followUps.length > 0 && (
                <>
                  <h3>Til manuell avklaring</h3>
                  <ul>
                    {proposal.followUps.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className="proposal-note">
                Endringslisten beskriver det genererte utkastet. Manuelle
                redigeringer vises i teksten og må kontrolleres på nytt.
              </p>
            </aside>
          </div>
          <details className="proposal-original">
            <summary>Se opprinnelig overleveringsnotat</summary>
            <pre>{analysis.documents.handover.text}</pre>
          </details>
          <div className="proposal-buttons">
            <Button
              onClick={verify}
              disabled={
                working ||
                !syntheticConfirmed ||
                !validText ||
                stale ||
                !allReviewed ||
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
                  ? "Forslaget er analysert"
                  : "Analyser forslaget mot kundeavtalen"}
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
            En ny analyse kontrollerer denne tekstversjonen mot samme
            kundeavtale. Redigering av teksten eller vurderingene gjør
            kontrollen ugyldig.
          </p>
          {activity === "verification" && (
            <p role="status" className="proposal-note">
              Forslaget analyseres. Godkjenning blir tilgjengelig når kontrollen
              er ferdig.
            </p>
          )}
          {check && (
            <div className="proposal-check">
              <div className="section-heading">
                <div>
                  <h3>Kontroll av det nye forslaget</h3>
                  <p>
                    {check.mode === "demo"
                      ? "Demokontroll av kjente formuleringer. Omskrivinger krever live AI eller manuell kontroll."
                      : `Ny live-analyse · ${check.model}`}
                  </p>
                </div>
                <span className="unresolved">
                  {remaining} funn som må undersøkes
                </span>
              </div>
              <p className="proposal-note">
                {check.findings.length} forpliktelser kontrollert ·{" "}
                {check.findings.length - remaining} dekket · {unverified} med
                uverifiserte sitater.
                {check.findings.length === 0 &&
                  " Ingen forpliktelser ble identifisert. Dette må kontrolleres manuelt."}
              </p>
              {check.findings.map((finding, i) => (
                <FindingCard
                  key={`${check.id}-${finding.id}`}
                  finding={finding}
                  index={i}
                  documents={check.documents}
                  readOnly
                />
              ))}
              <div className="proposal-approval">
                <div>
                  <strong>
                    {approved && canApprove
                      ? "Forslaget er godkjent av deg"
                      : "Kontroller endringene før du godkjenner"}
                  </strong>
                  <p>
                    {remaining
                      ? `Kontrollen viser fortsatt ${remaining} mulige mangler eller avklaringsbehov. Undersøk disse før du tar stilling til notatet.`
                      : "Ingen ytterligere avvik ble flagget i denne kontrollen. Det er fortsatt du som vurderer innholdet."}{" "}
                    Godkjenningen gjelder bare dette interne notatet.
                  </p>
                </div>
                <Button
                  disabled={!canApprove || approved}
                  onClick={() => {
                    if (canApprove) setApproved(true);
                  }}
                >
                  <Check size={16} />
                  {approved && canApprove ? "Godkjent" : "Godkjenn forslag"}
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
