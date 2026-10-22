import "server-only";
import { proposalRequestSchema } from "@/lib/proposal";
import { generateProposal } from "@/lib/server/proposal";
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
    const parsed = proposalRequestSchema.safeParse(
      await readLimitedJson(request, 512_000),
    );
    if (!parsed.success) {
      const noFindings = parsed.error.issues.find(
        (issue) => issue.code === "custom" && issue.params?.code === "NO_FINDINGS",
      );
      if (noFindings) throw new AppError(noFindings.message, 400, "NO_FINDINGS");
      throw new AppError(
        "Potensielt manglende funn og funn som må avklares må være vurdert. Vurderingene må tilhøre denne analysen.",
      );
    }
    release = acquireLimit("analysis", 5, 10 * 60_000, 1);
    return Response.json(
      { proposal: await generateProposal(parsed.data) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  } finally {
    release?.();
  }
}
