import { HandoverApp } from "@/components/handover-app";
import { getModel } from "@/lib/server/gemini";
export const dynamic = "force-dynamic";
export default function Page() {
  return <HandoverApp model={getModel()} />;
}
