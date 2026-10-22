"use client";
import { useMemo } from "react";
import { compareLines } from "@/lib/text-diff";

export function TextComparison({
  original,
  draft,
}: {
  original: string;
  draft: string;
}) {
  const lines = useMemo(() => compareLines(original, draft), [original, draft]);
  const added = lines.filter((line) => line.type === "added").length;
  const removed = lines.filter((line) => line.type === "removed").length;
  return (
    <details className="text-comparison">
      <summary>
        Tekstendringer <span className="diff-summary-count">{added} lagt til · {removed} fjernet</span>
      </summary>
      <p>
        Originalnotatet mot utkastet du redigerer. Beregnet lokalt, linje for linje.
      </p>
      <div className="diff-legend">
        <span className="diff-added">+ Lagt til</span>
        <span className="diff-removed">− Fjernet</span>
        <span>Uendret</span>
      </div>
      {added === 0 && removed === 0 && <p>Ingen tekstendringer.</p>}
      <ol className="diff-lines" aria-label="Tekstsammenligning">
        {lines.map((line, index) => (
          <li key={index} className={`diff-${line.type}`}>
            <span className="diff-marker" aria-hidden="true">
              {line.type === "added"
                ? "+"
                : line.type === "removed"
                  ? "−"
                  : " "}
            </span>
            <span className="sr-only">
              {line.type === "added"
                ? "Lagt til: "
                : line.type === "removed"
                  ? "Fjernet: "
                  : "Uendret: "}
            </span>
            {line.type === "added" ? (
              <ins>{line.text || "\u00a0"}</ins>
            ) : line.type === "removed" ? (
              <del>{line.text || "\u00a0"}</del>
            ) : (
              <span>{line.text || "\u00a0"}</span>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
