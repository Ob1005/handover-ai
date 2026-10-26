import { describe, expect, it } from "vitest";
import { extractDocument } from "../src/lib/files";
import { readFileSync } from "node:fs";
import { quoteExists } from "../src/lib/evidence";
import { documentsSchema } from "../src/lib/schemas";

// Minimal genuine PDF fixture with a selectable text stream and correct xref offsets.
function pdf(text: string) {
  const stream = `BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(output));
    output += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new File([output], "fixture.pdf", { type: "application/pdf" });
}
describe("real text extraction", () => {
  it("extracts the complete multi-page PDF scenario with Norwegian text within the shared input budget", async () => {
    const scenario = JSON.parse(readFileSync("evaluation/pdf-scenario.json", "utf8")) as {
      documents: Record<"agreement" | "handover" | "correspondence", string>;
      checks: Record<string, string>[];
    };
    const entries = await Promise.all(Object.entries(scenario.documents).map(async ([id, name]) => {
      const bytes = readFileSync(`public/examples/pdf/${name}`);
      return [id, await extractDocument(new File([bytes], name, { type: "application/pdf" }), id as keyof typeof scenario.documents)];
    }));
    const documents = documentsSchema.parse(Object.fromEntries(entries));
    expect(documents.agreement.text).toContain("11. Avtalestatus");
    expect(documents.handover.text).toContain("9. Praktisk overlevering");
    expect(documents.correspondence!.text).toContain("E-post 6");
    for (const role of ["agreement", "handover", "correspondence"] as const) {
      const document = documents[role]!;
      expect(document.type).toBe("pdf");
      expect(document.text.length).toBeGreaterThan(5_000);
      expect(document.text).not.toContain("\uFFFD");
      for (const check of scenario.checks) {
        if (check[role]) expect(quoteExists(check[role], document.text), `${check.id}: ${role}`).toBe(true);
      }
    }
  });
  it("extracts UTF-8 TXT with Norwegian characters", async () => {
    const doc = await extractDocument(
      new File(
        ["Opplæring for fem nøkkelbrukere skal inngå i leveransen."],
        "avtale.txt",
        { type: "text/plain" },
      ),
      "agreement",
    );
    expect(doc.text).toContain("fem nøkkelbrukere");
    expect(doc.id).toBe("agreement");
  });
  it("rejects invalid UTF-8 and a renamed non-PDF", async () => {
    await expect(
      extractDocument(
        new File([new Uint8Array([255, 254, 0, 5])], "bad.txt"),
        "agreement",
      ),
    ).rejects.toThrow(/UTF-8/);
    await expect(
      extractDocument(
        new File(["This is not a PDF file"], "bad.pdf"),
        "agreement",
      ),
    ).rejects.toThrow(/gyldig PDF/);
  });
  it("extracts selectable PDF text", async () => {
    const doc = await extractDocument(
      pdf("Training for five users is included."),
      "agreement",
    );
    expect(doc.text).toContain("Training for five users is included.");
    expect(doc.text).not.toMatch(/-- 1 of/);
  });
  it("rejects a PDF without extractable text", async () => {
    await expect(extractDocument(pdf(""), "handover")).rejects.toThrow(
      /mangler lesbar tekst|Fant ikke nok/,
    );
  });
});
