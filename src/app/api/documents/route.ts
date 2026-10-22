import "server-only";
import { extractDocument } from "@/lib/files";
import { AppError, errorResponse } from "@/lib/errors";
import { MAX_FILE_BYTES, documentIds } from "@/lib/schemas";
import {
  acquireLimit,
  assertSameOrigin,
  readLimitedBody,
} from "@/lib/server/limits";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    assertSameOrigin(request);
    release = acquireLimit("upload", 30, 60_000, 2);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
      throw new AppError("Bruk filopplasting.", 415);
    const body = await readLimitedBody(request, MAX_FILE_BYTES + 16_384);
    const form = await new Response(body, {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
    const file = form.get("file");
    const id = form.get("id");
    if (
      !(file instanceof File) ||
      !documentIds.includes(id as (typeof documentIds)[number])
    )
      throw new AppError("Velg en fil og riktig dokumentrolle.");
    if (form.get("syntheticOnly") !== "true")
      throw new AppError(
        "Bekreft at dokumentene er syntetiske og uten konfidensielle opplysninger.",
      );
    return Response.json(
      {
        document: await extractDocument(
          file,
          id as (typeof documentIds)[number],
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  } finally {
    release?.();
  }
}
