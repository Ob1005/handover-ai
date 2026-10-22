"use client";
import {
  Check,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  FileText,
  Info,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  categoryLabels,
  documentLabels,
  informationLabels,
  classificationLabels,
  type AnalysisResult,
  type Classification,
  type Finding,
  type Review,
} from "@/lib/schemas";
export const statusIcons = {
  covered: CircleCheck,
  potentially_missing: TriangleAlert,
  needs_clarification: CircleHelp,
};
function Status({ value, label }: { value: Classification; label?: string }) {
  const Icon = statusIcons[value];
  return (
    <span className={`badge ${value}`}>
      <Icon size={13} />
      {label ?? classificationLabels[value]}
    </span>
  );
}

export function FindingCard({
  finding,
  index,
  documents,
  review = { decision: "unreviewed", comment: "" },
  onReview = () => {},
  readOnly = false,
  transferredFollowUp = false,
}: {
  finding: Finding;
  index: number;
  documents: AnalysisResult["documents"];
  review?: Review;
  onReview?: (change: Partial<Review>) => void;
  readOnly?: boolean;
  transferredFollowUp?: boolean;
}) {
  return (
    <details
      className={`finding-card ${review.decision !== "unreviewed" ? "reviewed" : ""}`}
      open={index === 0 || undefined}
    >
      <summary>
        <span className={`finding-symbol ${finding.classification}`}>
          {(() => {
            const Icon = statusIcons[finding.classification];
            return <Icon size={18} />;
          })()}
        </span>
        <div className="finding-title">
          <span className="finding-category">
            {categoryLabels[finding.category]}
            {finding.certainty === "ambiguous" && " · Uklar formulering"}
          </span>
          <h3>{finding.title}</h3>
        </div>
        <div className="finding-summary-right">
          <Status value={finding.classification} label={transferredFollowUp ? "Overført med oppfølging" : undefined} />
          {review.decision !== "unreviewed" && (
            <span className="reviewed-label">
              <CheckCheck size={13} />
              {review.decision === "confirmed" ? "Bekreftet" : "Avvist"}
            </span>
          )}
          <ChevronDown size={17} className="expand-chevron" />
        </div>
      </summary>
      <div className="finding-body">
        <p className="information-authority">
          <strong>{informationLabels[finding.informationType]}</strong>
          {finding.sourceDocumentId !== "agreement" &&
            " · Ikke et bekreftet avtalevilkår"}
          {finding.requiresConfirmation && " · Krever bekreftelse"}
          {transferredFollowUp && " · Dokumentert i notatet, fortsatt åpen sak"}
        </p>
        <p className="finding-description">{finding.description}</p>
        {finding.modelClassification !== finding.classification && (
          <p className="validation-warning">
            Klassifiseringen er justert etter kildekontrollen.
            AI foreslo:{" "}
            {classificationLabels[finding.modelClassification]}.
          </p>
        )}
        <div className="finding-explanation">
          <strong>{transferredFollowUp ? "Hva som er overført" : "Begrunnelse"}</strong>
          <p>{finding.explanation}</p>
        </div>
        <div className="evidence-grid">
          <Evidence
            title={documentLabels[finding.sourceDocumentId]}
            documentId={finding.sourceDocumentId}
            filename={
              documents[finding.sourceDocumentId]?.name ??
              "Kilde ikke tilgjengelig"
            }
            quote={finding.sourceQuote}
            status={finding.evidence.source}
          />
          {finding.relatedSources.map((ref, i) => (
            <Evidence
              key={`${ref.documentId}-${i}`}
              title={documentLabels[ref.documentId]}
              documentId={ref.documentId}
              filename={
                documents[ref.documentId]?.name ?? "Kilde ikke tilgjengelig"
              }
              quote={ref.quote}
              status={finding.evidence.relatedSources[i]}
            />
          ))}
          <Evidence
            title="Overleveringsnotat"
            documentId="B · handover"
            filename={documents.handover.name}
            quote={finding.handoverQuote}
            status={finding.evidence.handover}
          />
        </div>
        <div className="evidence-note">
          <ShieldCheck size={13} />
          {finding.evidence.status === "verified"
            ? "Sitatene er kontrollert mot dokumentene."
            : "Minst ett sitat er ikke verifisert. Kontroller kilden før du vurderer funnet."}
          <span>{finding.id}</span>
        </div>
        {!readOnly && (
          <div className="human-review">
            <div className="human-review-title">
              <strong>Din vurdering{finding.classification === "covered" ? " (valgfritt)" : ""}</strong>
              <span>Stemmer funnet og klassifiseringen?</span>
            </div>
            <div className="review-buttons">
              <Button
                size="sm"
                variant={
                  review.decision === "confirmed" ? "default" : "outline"
                }
                aria-pressed={review.decision === "confirmed"}
                onClick={() => onReview({ decision: "confirmed" })}
              >
                <Check size={14} />
                Bekreft funn
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={
                  review.decision === "rejected" ? "rejected-button" : ""
                }
                aria-pressed={review.decision === "rejected"}
                onClick={() => onReview({ decision: "rejected" })}
              >
                <X size={14} />
                Avvis funn
              </Button>
              {review.decision !== "unreviewed" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onReview({ decision: "unreviewed" })}
                >
                  Angre
                </Button>
              )}
            </div>
            <details className="review-comment-details" open={review.comment ? true : undefined}>
              <summary>{review.comment ? "Kommentar" : "Legg til kommentar"} <span>(valgfritt)</span></summary>
              <label className="review-comment" htmlFor={`comment-${finding.id}`}>
                <span className="sr-only">Kommentar til funnet</span>
              <textarea
                id={`comment-${finding.id}`}
                value={review.comment}
                maxLength={1000}
                onChange={(e) => onReview({ comment: e.target.value })}
                rows={2}
                placeholder="Begrunn vurderingen eller noter neste steg."
              />
              </label>
            </details>
            <span className="review-help">
              Du vurderer funnet. Avtalen og AI-klassifiseringen endres ikke.
            </span>
          </div>
        )}
      </div>
    </details>
  );
}

function Evidence({
  title,
  documentId,
  filename,
  quote,
  status,
}: {
  title: string;
  documentId: string;
  filename: string;
  quote: string | null;
  status: "verified" | "unverified" | "not_provided";
}) {
  return (
    <div className="evidence-card">
      <div className="evidence-heading">
        <span>
          <FileText size={14} />
          {title}
        </span>
        <span className={`quote-status ${status}`}>
          {status === "verified" ? (
            <CircleCheck size={12} />
          ) : (
            <Info size={12} />
          )}
          {status === "verified"
            ? "Sitat verifisert"
            : status === "not_provided"
              ? "Ingen tilsvarende tekst funnet"
              : "Sitat ikke verifisert"}
        </span>
      </div>
      {quote ? (
        <blockquote>«{quote}»</blockquote>
      ) : (
        <p className="no-quote">
          Ingen tilsvarende opplysning funnet. Kontroller notatet manuelt.
        </p>
      )}
      <div className="evidence-source">
        <span>{documentId}</span>
        <span title={filename}>{filename}</span>
      </div>
    </div>
  );
}
