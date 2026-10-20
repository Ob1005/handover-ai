import "server-only";
import { analyzeRequestSchema } from "@/lib/schemas";
import { AppError, errorResponse } from "@/lib/errors";
import { analyzeDocuments } from "@/lib/server/gemini";
import {
  acquireLimit,
  assertSameOrigin,
  readLimitedJson,
} from "@/lib/server/limits";
export const runtime = "nodejs";
export const maxDuration = 65;
export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    assertSameOrigin(request);
    const parsed = analyzeRequestSchema.safeParse(
      await readLimitedJson(request, 260_000),
    );
    if (!parsed.success)
      throw new AppError(
        "Ugyldige dokumenter. Bruk to dokumenter med 20–20 000 tegn og bekreft at de er syntetiske.",
      );
    release = acquireLimit("analysis", 5, 10 * 60_000, 1);
    const { agreement, handover } = parsed.data;
    return Response.json(
      { result: await analyzeDocuments({ agreement, handover }) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  } finally {
    release?.();
  }
}
