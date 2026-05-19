import { requireCurrentUserForRoute } from "@/server/auth";
import { getConversationDetailByIdForUser } from "@/server/db";
import { errorResponse, jsonResponse } from "@/server/http";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUserForRoute();
    const { id } = await context.params;
    const conversation = getConversationDetailByIdForUser(user.id, id);
    if (!conversation) {
      return errorResponse(404, "Conversation not found.");
    }

    return jsonResponse({ conversation });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return errorResponse(401, "Authentication required.");
    }

    return errorResponse(500, "Failed to load conversation.");
  }
}
