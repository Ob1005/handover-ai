"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCheck,
  CircleCheck,
  FileCheck2,
  FileText,
  GitCompareArrows,
  Info,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { FindingCard, statusIcons } from "./finding-card";
import { ProposalPanel } from "./proposal-panel";
import {
  analysisSchema,
  classificationLabels,
  classifications,
  documentSchema,
  documentsSchema,
  documentLabels,
  supportingIds,
  listDocuments,
  MAX_TOTAL_TEXT_LENGTH,
  type DocumentId,
  type AnalysisResult,
  type Classification,
  type Reviews,
  type UploadedDocument,
} from "@/lib/schemas";
import { getDemoAnalysis } from "@/lib/demo";
import {
  getWorkflowStep,
  canGenerateProposal,
  reviewProgress,
  requiresReview,
  updateReview,
  type WorkflowActivity,
} from "@/lib/review";
import { validateFile } from "@/lib/file-validation";
import { duplicateDocumentMessage } from "@/lib/document-validation";

export function HandoverApp({ model }: { model: string }) {
  const [documents, setDocuments] = useState<
    Partial<Record<DocumentId, UploadedDocument>>
  >({});
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [reviews, setReviews] = useState<Reviews>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<WorkflowActivity>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Classification | "all">("all");
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [documentView, setDocumentView] = useState<DocumentId | null>(null);
  const lock = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function upload(file: File, id: DocumentId) {
    if (lock.current) return;
    setError("");
    if (!consent) {
      setError(
        "Bekreft først at dokumentene er syntetiske og uten konfidensielle opplysninger.",
      );
      return;
    }
    try {
      validateFile(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ugyldig fil.");
      return;
    }
    lock.current = true;
    setBusy(id);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("id", id);
      form.set("syntheticOnly", "true");
      const response = await fetch("/api/documents", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(35_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunne ikke lese filen.");
      const doc = documentSchema.parse(data.document);
      if (doc.id !== id)
        throw new Error("Dokumentrollen stemmer ikke. Prøv igjen.");
      setDocuments((prev) => ({ ...prev, [id]: doc }));
      setResult(null);
      setReviews({});
      setFilter("all");
      setOnlyUnreviewed(false);
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "Opplastingen tok for lang tid. Prøv en mindre fil.",
      );
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }
  function demo() {
    if (lock.current) return;
    const demoResult = getDemoAnalysis();
    setDocuments(demoResult.documents);
    setResult(demoResult);
    setReviews({});
    setConsent(true);
    setError("");
    setFilter("all");
    setOnlyUnreviewed(false);
    setTimeout(
      () =>
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      80,
    );
  }
  function removeSupporting(id: (typeof supportingIds)[number]) {
    if (busy) return;
    setDocuments((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setDocumentView(null);
    setResult(null);
    setReviews({});
    setError("");
    setFilter("all");
    setOnlyUnreviewed(false);
  }
  const duplicateWarning = duplicateDocumentMessage(documents);
  const totalCharacters = listDocuments(documents).reduce(
    (sum, d) => sum + d.text.length,
    0,
  );
  async function analyze() {
    if (lock.current || !documents.agreement || !documents.handover || !consent)
      return;
    if (duplicateWarning) return;
    const checkedDocuments = documentsSchema.safeParse(documents);
    if (!checkedDocuments.success) {
      setError(
        "Kontroller dokumentene. Maksimalt 40 000 tegn samlet; fjern eller forkort en kilde. Ingen tekst avkortes automatisk.",
      );
      return;
    }
    lock.current = true;
    setBusy("analysis");
    setError("");
    setResult(null);
    setReviews({});
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...documents, syntheticOnly: consent }),
        signal: AbortSignal.timeout(70_000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Analysen kunne ikke fullføres.");
      const parsed = analysisSchema.parse(data.result);
      setResult(parsed);
      setReviews({});
      setFilter("all");
      setOnlyUnreviewed(false);
      setTimeout(
        () =>
          resultsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        80,
      );
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "Analysen tok for lang tid. Prøv kortere dokumenter.",
      );
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }
  function reset() {
    setResult(null);
    setDocuments({});
    setReviews({});
    setError("");
    setConsent(false);
    setFilter("all");
    setOnlyUnreviewed(false);
  }
  const progress = result ? reviewProgress(result.findings, reviews) : null;
  const visible =
    result?.findings.filter(
      (f) =>
        (filter === "all" || f.classification === filter) &&
        (!onlyUnreviewed ||
          (requiresReview(f) &&
            (!reviews[f.id] || reviews[f.id].decision === "unreviewed"))),
    ) ?? [];
  const counts = Object.fromEntries(
    classifications.map((c) => [
      c,
      result?.findings.filter((f) => f.classification === c).length ?? 0,
    ]),
  ) as Record<Classification, number>;
  const currentStep = getWorkflowStep(documents, busy, result, reviews);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Hopp til innhold</a>
      <div className="main-shell">
        <header className="topbar">
          <Link className="brand" href="/" aria-label="Handover AI, startside">
            <span className="brand-mark"><GitCompareArrows size={22} /></span>
            <span>handover<span className="brand-ai">AI</span></span>
          </Link>
          <div className="header-context">Overleveringskontroll</div>
          <div className="topbar-meta">
            <span className="prototype-label">Prototype</span>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">FRA SALG TIL LEVERANSE</div>
              <h1>Fra avtale til leveranse.</h1>
              <p>
                Sjekk at leveringsteamet har fått med seg det som er avtalt.
              </p>
            </div>
            {!result && !busy && (
              <div className="demo-invite">
                <div><strong>Se hvordan det fungerer</strong><span>Ferdig eksempel. Ingen API-nøkkel nødvendig.</span></div>
                <Button variant="outline" onClick={demo}><Play size={15} /> Prøv demo</Button>
              </div>
            )}
          </div>
          <ol className="steps" aria-label="Arbeidsflyt">
            {[
              "Dokumenter",
              "Analyse",
              "Vurder funn",
              "Oppdater notatet",
            ].map((label, i) => (
              <li
                key={label}
                className={
                  currentStep === i + 1
                    ? "step current"
                    : currentStep > i + 1
                      ? "step complete"
                      : "step"
                }
                aria-current={currentStep === i + 1 ? "step" : undefined}
              >
                <span className="step-number">
                  {currentStep > i + 1 ? <Check size={14} /> : `0${i + 1}`}
                </span>
                <span>{label}</span>
                {i < 3 && <span className="step-line" />}
              </li>
            ))}
          </ol>

          <div className="restriction">
            <ShieldCheck size={18} />
            <div>
              <strong>Bruk bare syntetiske dokumenter</strong>
              <span>Ikke last opp ekte avtaler, personopplysninger eller konfidensielt innhold.</span>
            </div>
          </div>

          <section
            className="documents-section"
            aria-labelledby="documents-title"
          >
            <div className="section-heading">
              <div>
                <h2 id="documents-title">Dokumenter</h2>
                <p>
                  Legg til kundeavtalen og notatet som skal kontrolleres.
                </p>
              </div>
              {result?.mode === "live" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={reset}
                  disabled={!!busy}
                >
                  <RotateCcw size={14} />
                  Ny kontroll
                </Button>
              )}
            </div>
            <label className="consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={!!busy}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                Dokumentene er syntetiske og inneholder ingen konfidensielle opplysninger.
              </span>
            </label>
            <div className="upload-grid">
              {(["agreement", "handover"] as const).map((id) => (
                <UploadCard
                  key={id}
                  id={id}
                  document={documents[id]}
                  disabled={!!busy || !consent}
                  loading={busy === id}
                  onUpload={(file) => upload(file, id)}
                  onView={() => setDocumentView(id)}
                />
              ))}
            </div>
            <details
              className="supporting-documents"
              open={supportingIds.some((id) => !!documents[id]) || undefined}
            >
              <summary>Legg til salgskilder <span>Valgfritt · opptil 3 dokumenter</span></summary>
              <p>
                Tilbud, e-poster og møtenotater kan avdekke forventninger og behov. Avtalen er fortsatt førende.
              </p>
              <div className="upload-grid">
                {supportingIds.map((id) => (
                  <UploadCard
                    key={id}
                    id={id}
                    document={documents[id]}
                    disabled={!!busy || !consent}
                    loading={busy === id}
                    onUpload={(file) => upload(file, id)}
                    onView={() => setDocumentView(id)}
                    onRemove={() => removeSupporting(id)}
                  />
                ))}
              </div>
            </details>
            {duplicateWarning && (
              <p className="proposal-error" role="alert">
                <TriangleAlert size={16} />
                {duplicateWarning}
              </p>
            )}
            <p
              className={
                totalCharacters > MAX_TOTAL_TEXT_LENGTH
                  ? "proposal-error"
                  : "document-budget"
              }
              role="status"
            >
              {totalCharacters.toLocaleString("nb-NO")} / 40 000 tegn samlet ·
              maks. 20 000 per dokument.
            </p>
            <div className="analyze-bar">
              <div className="model-info">
                <span>
                  <Sparkles size={14} /><span>Modell <strong>{model}</strong></span>
                </span>
              </div>
              <Button
                onClick={analyze}
                disabled={
                  !!busy ||
                  !consent ||
                  !!duplicateWarning ||
                  totalCharacters > MAX_TOTAL_TEXT_LENGTH ||
                  !documents.agreement ||
                  !documents.handover ||
                  result?.mode === "live"
                }
              >
                {busy === "analysis" ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Sparkles size={17} />
                )}
                {busy === "analysis"
                  ? "Analyserer dokumentene …"
                  : "Analyser med AI"}
                {busy !== "analysis" && <ArrowRight size={16} />}
              </Button>
            </div>
          </section>

          {error && (
            <div className="error-message" role="alert">
              <TriangleAlert size={18} />
              <div>
                <strong>Kunne ikke fullføre</strong>
                <p>{error}</p>
                {result?.mode === "demo" && (
                  <p>
                    Resultatene nedenfor er fortsatt den forhåndsberegnede
                    demoen.
                  </p>
                )}
              </div>
              <button
                aria-label="Lukk feilmelding"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {busy === "analysis" && (
            <div className="loading-panel" role="status" aria-live="polite">
              <LoaderCircle className="spin" size={24} />
              <h3>Analyserer dokumentene</h3>
              <p>
                Sammenligner innholdet og kontrollerer kildesitatene.
              </p>
              <span>Dette kan ta opptil ett minutt.</span>
            </div>
          )}

          {result && progress ? (
            <section
              className="results-section"
              ref={resultsRef}
              aria-labelledby="results-title"
              inert={!!busy && busy !== "generation" && busy !== "verification"}
            >
              <div className={`analysis-origin ${result.mode}`}>
                <span>
                  {result.mode === "demo" ? (
                    <Play size={15} />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  <strong>
                    {result.mode === "demo"
                      ? "Demo · forhåndsberegnede resultater"
                      : "Live AI-analyse · " + result.model}
                  </strong>
                </span>
                {result.mode === "demo" ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>Fjordlogistikk AS · fiktivt prosjekt</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!!busy}
                      onClick={() => {
                        reset();
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      <X size={14} />
                      Lukk demo
                    </Button>
                  </div>
                ) : (
                  <span>
                    {new Date(result.createdAt).toLocaleString("nb-NO")}
                  </span>
                )}
              </div>
              <div className="section-heading results-heading">
                <div>
                  <div className="eyebrow">KONTROLLRESULTAT</div>
                  <h2 id="results-title">Hva har kommet med?</h2>
                  <p>
                    Vurder mulige mangler og avklaringsbehov. Dekkede punkter kan du se gjennom ved behov.
                  </p>
                </div>
                <span className="unresolved">
                  <span />
                  {result.findings.length === 0 ? "Ingen funn å vurdere" : progress.unresolved === 0 ? "Ferdig vurdert" : `${progress.unresolved} gjenstår`}
                </span>
              </div>
              <div className="summary-grid">
                <div className="summary-card">
                  <span>Punkter funnet</span>
                  <strong>{result.findings.length}</strong>
                  <small>i dokumentene</small>
                </div>
                {(
                  [
                    "potentially_missing",
                    "needs_clarification",
                    "covered",
                  ] as const
                ).map((c) => {
                  const Icon = statusIcons[c];
                  return (
                    <button
                      className={`summary-card summary-status ${c} ${filter === c ? "selected" : ""}`}
                      key={c}
                      onClick={() => setFilter(filter === c ? "all" : c)}
                      aria-pressed={filter === c}
                    >
                      <span>
                        <Icon size={16} />
                        {classificationLabels[c]}
                      </span>
                      <strong>{counts[c]}</strong>
                      <small>
                        {c === "covered"
                          ? "overført til notatet"
                          : c === "potentially_missing"
                            ? "ikke funnet i notatet"
                            : "trenger din vurdering"}
                      </small>
                    </button>
                  );
                })}
              </div>
              <div className="review-progress">
                <span>
                  <CheckCheck size={17} />
                  <strong>
                    {progress.reviewed} av {progress.total}
                  </strong>{" "}
                  vurdert
                </span>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="Vurderingsfremdrift"
                  aria-valuenow={progress.total ? progress.reviewed : result.findings.length ? 1 : 0}
                  aria-valuemin={0}
                  aria-valuemax={progress.total || 1}
                >
                  <div
                    style={{
                      width: `${progress.total ? (progress.reviewed / progress.total) * 100 : result.findings.length ? 100 : 0}%`,
                    }}
                  />
                </div>
                <span>
                  {!result.findings.length
                    ? "Kontroller dokumentene og start en ny analyse"
                    : progress.unresolved === 0
                    ? "Klar til å lage forslag"
                    : "Beholdes mens siden er åpen"}
                </span>
              </div>
              <div className="findings-toolbar">
                <div
                  className="filters"
                  role="group"
                  aria-label="Filtrer etter AI-klassifisering"
                >
                  <button
                    aria-pressed={filter === "all"}
                    onClick={() => setFilter("all")}
                  >
                    Alle funn <span>{result.findings.length}</span>
                  </button>
                  {classifications.map((c) => (
                    <button
                      key={c}
                      aria-pressed={filter === c}
                      onClick={() => setFilter(c)}
                    >
                      {classificationLabels[c]} <span>{counts[c]}</span>
                    </button>
                  ))}
                </div>
                <label className="unreviewed-toggle">
                  <input
                    type="checkbox"
                    checked={onlyUnreviewed}
                    onChange={(e) => setOnlyUnreviewed(e.target.checked)}
                  />
                  Vis bare uvurderte avvik
                </label>
              </div>
              <div className="findings-list">
                {visible.length ? (
                  visible.map((finding, i) => (
                    <FindingCard
                      key={`${result.id}-${finding.id}`}
                      finding={finding}
                      index={i}
                      documents={result.documents}
                      review={
                        reviews[finding.id] || {
                          decision: "unreviewed",
                          comment: "",
                        }
                      }
                      onReview={(change) =>
                        setReviews((prev) =>
                          updateReview(prev, finding.id, change),
                        )
                      }
                    />
                  ))
                ) : (
                  <div className="empty-findings">
                    <CircleCheck size={26} />
                    <h3>
                      {result.findings.length
                        ? "Ingen funn i dette utvalget"
                        : "Ingen forpliktelser identifisert"}
                    </h3>
                    <p>
                      {result.findings.length
                        ? "Velg et annet filter for å se flere funn."
                        : "Kontroller at du har lastet opp en kundeavtale og et overleveringsnotat. Start en ny kontroll med riktige dokumenter. Du kan ikke generere forslag uten et kontrollgrunnlag."}
                    </p>
                  </div>
                )}
              </div>
              <details className="result-disclaimer">
                <summary><Info size={15} /> Om vurderingene</summary>
                <p>Bekreft et funn når du er enig i vurderingen, selv om saken fortsatt er åpen. Verifiserte sitater bekrefter tekstforekomst, ikke at AI-tolkningen er riktig. Fravær av et sitat beviser ikke en mangel. Kontrollen er ingen juridisk vurdering.</p>
              </details>
              <ProposalPanel
                key={result.id}
                analysis={result}
                reviews={reviews}
                allReviewed={canGenerateProposal(result, reviews)}
                syntheticConfirmed={consent}
                activity={
                  busy === "generation" || busy === "verification" ? busy : null
                }
                onActivity={setBusy}
              />
            </section>
          ) : null}
          <footer>
            <span>
              Handover AI <span className="footer-divider">/</span> Porteføljeprototype
            </span>
            <span>AI foreslår. Du vurderer og godkjenner.</span>
          </footer>
        </main>
      </div>
      {documentView && documents[documentView] && (
        <DocumentDialog
          document={documents[documentView]!}
          onClose={() => setDocumentView(null)}
        />
      )}
    </div>
  );
}

function UploadCard({
  id,
  document,
  disabled,
  loading,
  onUpload,
  onView,
  onRemove,
}: {
  id: DocumentId;
  document?: UploadedDocument;
  disabled: boolean;
  loading: boolean;
  onUpload: (file: File) => void;
  onView: () => void;
  onRemove?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const title = documentLabels[id];
  return (
    <div className="upload-card">
      <div className="upload-card-heading">
        <span className="doc-letter">
          {
            {
              agreement: "A",
              handover: "B",
              proposal: "C",
              correspondence: "D",
              meeting_notes: "E",
            }[id]
          }
        </span>
        <div>
          <h3>{title}</h3>
          <p>
            {id === "agreement"
              ? "Signert avtale eller arbeidsbeskrivelse"
              : id === "handover"
                ? "Notatet fra salg til leveringsteamet"
                : "Valgfri salgskilde · PDF eller TXT"}
          </p>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept=".pdf,.txt,application/pdf,text/plain"
        aria-label={`Last opp ${title.toLowerCase()}`}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <button
        className={`dropzone ${drag ? "dragging" : ""} ${document ? "has-document" : ""}`}
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!disabled && e.dataTransfer.files[0])
            onUpload(e.dataTransfer.files[0]);
        }}
      >
        {loading ? (
          <LoaderCircle className="spin" size={23} />
        ) : document ? (
          <span className="uploaded-file-icon">
            <FileCheck2 size={24} />
          </span>
        ) : (
          <span className="upload-icon">
            <Upload size={21} />
          </span>
        )}
        <strong>
          {loading
            ? "Henter ut tekst …"
            : document
              ? document.name
              : "Velg fil eller dra den hit"}
        </strong>
        <span>
          {document
            ? `${document.text.length.toLocaleString("nb-NO")} tegn · Klikk for å bytte fil`
            : "PDF eller TXT · maks. 2 MB"}
        </span>
      </button>
      <div className="upload-card-footer">
        {document ? (
          <>
            <span>
              <CircleCheck size={13} />
              Klar for analyse
            </span>
            <button onClick={onView}>
              <FileText size={13} />
              Se tekst
            </button>
            {onRemove && (
              <button
                onClick={onRemove}
                disabled={disabled}
                aria-label={`Fjern ${title.toLowerCase()}`}
              >
                Fjern
              </button>
            )}
          </>
        ) : (
          <>
            <span>
              <FileText size={13} />
              {id === "agreement"
                ? "PDF må ha markerbar tekst"
                : id === "handover"
                  ? "PDF må ha markerbar tekst"
                  : "Tilleggsinformasjon, ikke avtalevilkår"}
            </span>
            <span>20 000 tegn</span>
          </>
        )}
      </div>
    </div>
  );
}

function DocumentDialog({
  document,
  onClose,
}: {
  document: UploadedDocument;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function download() {
    const url = URL.createObjectURL(
      new Blob([document.text], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = globalThis.document.createElement("a");
    anchor.href = url;
    anchor.download = document.name.replace(/\.[^.]+$/, "") + "_uttrukket.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <dialog
      ref={dialog}
      className="document-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="document-dialog-title"
    >
      <div className="dialog-header">
        <div>
          <span className="eyebrow">UTTRUKKET KILDETEKST · {document.id}</span>
          <h2 id="document-dialog-title">{document.name}</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Lukk dokument"
          onClick={onClose}
        >
          <X size={20} />
        </Button>
      </div>
      <pre>{document.text}</pre>
      <div className="dialog-footer">
        <span>
          {document.text.length.toLocaleString("nb-NO")} tegn · Uten sidereferanser
        </span>
        <Button variant="outline" size="sm" onClick={download}>
          <ArrowDownToLine size={14} />
          Last ned tekst
        </Button>
      </div>
    </dialog>
  );
}
