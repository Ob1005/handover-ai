import { describe, expect, it } from "vitest";
import { compareLines } from "../src/lib/text-diff";

describe("deterministic comparison of original and current draft", () => {
  it("keeps unchanged text neutral and marks replacement as removal plus addition", () => {
    expect(
      compareLines(
        "Prosjekt\nFrist: 15. desember\nOpplæring",
        "Prosjekt\nFrist: 1. desember\nOpplæring",
      ),
    ).toEqual([
      { type: "unchanged", text: "Prosjekt" },
      { type: "removed", text: "Frist: 15. desember" },
      { type: "added", text: "Frist: 1. desember" },
      { type: "unchanged", text: "Opplæring" },
    ]);
  });
  it("handles empty, identical and purely added or removed text", () => {
    expect(compareLines("", "")).toEqual([]);
    expect(compareLines("Uendret", "Uendret")).toEqual([
      { type: "unchanged", text: "Uendret" },
    ]);
    expect(compareLines("", "Ny tekst")).toEqual([
      { type: "added", text: "Ny tekst" },
    ]);
    expect(compareLines("Gammel tekst", "")).toEqual([
      { type: "removed", text: "Gammel tekst" },
    ]);
  });
  it("reflects manual edits against the original, not just the initial AI draft", () => {
    const original = "Prosjekt\nERP er ikke omtalt.";
    const first = "Prosjekt\nERP er inkludert.";
    const edited = first + "\nKunden leverer CSV-data.";
    expect(compareLines(original, edited)).toContainEqual({
      type: "added",
      text: "Kunden leverer CSV-data.",
    });
    expect(compareLines(original, edited)).toContainEqual({
      type: "removed",
      text: "ERP er ikke omtalt.",
    });
    expect(
      compareLines(original, original).every(
        (line) => line.type === "unchanged",
      ),
    ).toBe(true);
  });
  it("preserves repeated lines, blank lines, spaces and trailing newlines", () => {
    const original = "A\n\nA\n  B\n";
    const draft = "A\nA\n B\nC\n";
    const diff = compareLines(original, draft);
    expect(
      diff
        .filter((l) => l.type !== "added")
        .map((l) => l.text)
        .join("\n"),
    ).toBe(original);
    expect(
      diff
        .filter((l) => l.type !== "removed")
        .map((l) => l.text)
        .join("\n"),
    ).toBe(draft);
    expect(
      compareLines("A\r\nB", "A\nB").every((l) => l.type === "unchanged"),
    ).toBe(true);
  });
  it("bounds work for many short lines and still reconstructs both documents", () => {
    const original = Array.from({ length: 600 }, (_, i) => `Før ${i}`).join(
      "\n",
    );
    const draft = Array.from({ length: 600 }, (_, i) => `Etter ${i}`).join(
      "\n",
    );
    const diff = compareLines(original, draft);
    expect(diff).toHaveLength(1200);
    expect(
      diff
        .filter((l) => l.type !== "added")
        .map((l) => l.text)
        .join("\n"),
    ).toBe(original);
    expect(
      diff
        .filter((l) => l.type !== "removed")
        .map((l) => l.text)
        .join("\n"),
    ).toBe(draft);
  });
});
