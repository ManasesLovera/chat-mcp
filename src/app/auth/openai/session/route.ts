import { deleteOpenAISession, upsertOpenAISession } from "@/server/db";
import { requireCurrentUserForRoute } from "@/server/auth";
import { errorResponse, jsonResponse } from "@/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUserForRoute();
    const payload = (await request.json()) as { apiKey?: unknown };
    if (typeof payload.apiKey !== "string" || payload.apiKey.trim() === "") {
      return errorResponse(400, "apiKey must be a non-empty string.");
    }

    upsertOpenAISession(user.id, payload.apiKey);
    return jsonResponse({
      ok: true,
      hasOpenAIConnection: true,
      hasOpenAICredential: true,
      chatUnlocked: true,
      openaiConnectionMode: "api_key_fallback",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return errorResponse(401, "Authentication required.");
    }

    return errorResponse(500, "Failed to save OpenAI credentials.");
  }
}

export async function DELETE() {
  try {
    const user = await requireCurrentUserForRoute();
    deleteOpenAISession(user.id);
    return jsonResponse({
      ok: true,
      hasOpenAIConnection: false,
      hasOpenAICredential: false,
      chatUnlocked: false,
      openaiConnectionMode: "none",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return errorResponse(401, "Authentication required.");
    }

    return errorResponse(500, "Failed to remove OpenAI credentials.");
  }
}
