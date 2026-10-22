import "server-only";
import { reanalysisRequestSchema } from "@/lib/reanalysis";
import { reanalyzeCommitments } from "@/lib/server/reanalysis";
import { AppError, errorResponse } from "@/lib/errors";
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
    const parsed = reanalysisRequestSchema.safeParse(
      await readLimitedJson(request, 512_000),
    );
    if (!parsed.success)
      throw new AppError(
        "Kontrollen krever opprinnelige forpliktelser, et gyldig notat og bekreftelse på syntetisk innhold.",
      );
    release = acquireLimit("analysis", 5, 10 * 60_000, 1);
    return Response.json(
      { result: await reanalyzeCommitments(parsed.data) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  } finally {
    release?.();
  }
}
