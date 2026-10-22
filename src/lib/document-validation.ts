import {
  documentLabels,
  listDocuments,
  type DocumentId,
  type UploadedDocument,
} from "./schemas";
import { normalizeWhitespace } from "./evidence";

// Compare the extracted content, not filenames. Renaming a file or changing its
// line breaks must not bypass the check. Different text with the same name is OK.
export function duplicateDocumentMessage(
  documents: Partial<Record<DocumentId, UploadedDocument>>,
): string | null {
  const seen = new Map<string, DocumentId>();
  for (const document of listDocuments(documents)) {
    const text = normalizeWhitespace(document.text);
    if (!text) continue;
    const previous = seen.get(text);
    if (previous) {
      return `«${documentLabels[previous]}» og «${documentLabels[document.id]}» har samme tekst. Bytt en av filene før du analyserer.`;
    }
    seen.set(text, document.id);
  }
  return null;
}
