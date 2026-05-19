import { requireCurrentUserForRoute } from "@/server/auth";
import { runConversationTurn } from "@/server/agent";
import { errorResponse, jsonResponse } from "@/server/http";
import { normalizeConversationMessageInput } from "@/server/validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUserForRoute();
    const { id } = await context.params;
    const payload = normalizeConversationMessageInput(await request.json());
    const conversation = await runConversationTurn({
      userId: user.id,
      conversationId: id,
      content: payload.content,
      selectedConfigIds: payload.selectedConfigIds,
      enableWebSearch: payload.enableWebSearch,
      enableMcpTools: payload.enableMcpTools,
    });

    return jsonResponse({ conversation });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return errorResponse(401, "Authentication required.");
    }

    return errorResponse(
      400,
      error instanceof Error ? error.message : "Failed to send message.",
    );
  }
}
