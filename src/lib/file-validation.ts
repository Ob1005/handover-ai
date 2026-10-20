import { AppError } from "./errors";
import { MAX_FILE_BYTES, MAX_TEXT_LENGTH } from "./schemas";

export function validateFile(file: {
  name: string;
  size: number;
  type: string;
}) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "pdf" && extension !== "txt")
    throw new AppError("Velg en PDF med markerbar tekst eller en TXT-fil.");
  const accepted =
    extension === "pdf"
      ? ["application/pdf", "application/octet-stream", ""]
      : ["text/plain", "application/octet-stream", ""];
  if (!accepted.includes(file.type))
    throw new AppError(
      "Filtypen stemmer ikke med filnavnet. Bruk PDF eller TXT.",
    );
  if (file.name.length > 180)
    throw new AppError("Filnavnet er for langt. Bruk maksimalt 180 tegn.");
  if (file.size === 0) throw new AppError("Filen er tom.");
  if (file.size > MAX_FILE_BYTES)
    throw new AppError("Filen er for stor. Maksimal størrelse er 2 MB.", 413);
  return extension;
}
export function validateExtractedText(text: string) {
  const cleaned = text.replace(/\u0000/g, "").trim();
  if (cleaned.length < 20)
    throw new AppError(
      "Fant ikke nok lesbar tekst. Skannede PDF-er støttes ikke. Bruk PDF med markerbar tekst eller TXT.",
    );
  if (cleaned.length > MAX_TEXT_LENGTH)
    throw new AppError(
      "Dokumentet inneholder for mye tekst. Maksimalt 20 000 tegn per dokument; del opp dokumentet.",
      413,
    );
  if (cleaned.includes("\uFFFD") || /[\x01-\x08\x0e-\x1f]/u.test(cleaned))
    throw new AppError(
      "Teksten kunne ikke leses. Lagre TXT-filen med UTF-8-koding.",
    );
  return cleaned;
}
