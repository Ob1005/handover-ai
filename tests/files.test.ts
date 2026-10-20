import { describe, expect, it } from "vitest";
import { extractDocument } from "../src/lib/files";

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
