import { AppError } from "./errors";
import {
  documentSchema,
  MAX_PDF_PAGES,
  type UploadedDocument,
} from "./schemas";

export { validateFile, validateExtractedText } from "./file-validation";
import { validateFile, validateExtractedText } from "./file-validation";

export async function extractDocument(
  file: File,
  id: UploadedDocument["id"],
): Promise<UploadedDocument> {
  const type = validateFile(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  let text: string;
  if (type === "txt") {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      throw new AppError("TXT-filen må være lagret som UTF-8.");
    }
  } else {
    if (!buffer.subarray(0, 1024).includes(Buffer.from("%PDF-")))
      throw new AppError("Filen er ikke en gyldig PDF.");
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer, isEvalSupported: false });
    try {
      const info = await parser.getInfo();
      if (info.total > MAX_PDF_PAGES)
        throw new AppError(
          "PDF-en har for mange sider. Maksimalt 40 sider.",
          413,
        );
      const result = await parser.getText({ pageJoiner: "\n" });
      text = result.text;
      if (result.pages.some((page) => page.text.trim().length < 20))
        throw new AppError(
          "Minst én PDF-side mangler lesbar tekst. Kontroller tomme eller skannede sider, eller bruk en komplett TXT-versjon.",
        );
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "PDF-en kunne ikke leses. Den kan være skadet eller passordbeskyttet. Bruk en ulåst PDF med markerbar tekst.",
      );
    } finally {
      await parser.destroy();
    }
  }
  return documentSchema.parse({
    id,
    documentType: id,
    name: file.name,
    text: validateExtractedText(text),
    bytes: file.size,
    type,
  });
}
