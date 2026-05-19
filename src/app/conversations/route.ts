import { requireCurrentUserForRoute } from "@/server/auth";
import {
  createConversationThread,
  getConversationDetailByIdForUser,
  listConversationsByUserId,
} from "@/server/db";
import { errorResponse, jsonResponse } from "@/server/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireCurrentUserForRoute();
    return jsonResponse({
      conversations: listConversationsByUserId(user.id),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return errorResponse(401, "Authentication required.");
    }

    return errorResponse(500, "Failed to load conversations.");
  }
}

export async function POST() {
  try {
    const user = await requireCurrentUserForRoute();
    const conversation = createConversationThread(user.id);
    return jsonResponse(
      {
        conversation: getConversationDetailByIdForUser(user.id, conversation.id),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return errorResponse(401, "Authentication required.");
    }

    return errorResponse(500, "Failed to create conversation.");
  }
}
