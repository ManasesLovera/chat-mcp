import { requireCurrentUserForRoute } from "@/server/auth";
import { runAgentTest } from "@/server/agent";
import { errorResponse, jsonResponse } from "@/server/http";
import { normalizeAgentTestInput } from "@/server/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUserForRoute();
    const payload = normalizeAgentTestInput(await request.json());
    const result = await runAgentTest({
      userId: user.id,
      prompt: payload.prompt,
      selectedConfigIds: payload.selectedConfigIds,
      enableWebSearch: payload.enableWebSearch,
    });

    return jsonResponse(result);
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return errorResponse(401, "Authentication required.");
    }

    return errorResponse(
      400,
      error instanceof Error ? error.message : "Agent test failed.",
    );
  }
}
