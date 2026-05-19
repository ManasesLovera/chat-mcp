import { deleteGeminiSession, upsertGeminiSession } from "@/server/db";
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

    upsertGeminiSession(user.id, payload.apiKey);
    return jsonResponse({
      ok: true,
      hasGeminiConnection: true,
      hasGeminiCredential: true,
      chatUnlocked: true,
      geminiConnectionMode: "api_key_fallback",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return errorResponse(401, "Authentication required.");
    }

    return errorResponse(500, "Failed to save Gemini credentials.");
  }
}

export async function DELETE() {
  try {
    const user = await requireCurrentUserForRoute();
    deleteGeminiSession(user.id);
    return jsonResponse({
      ok: true,
      hasGeminiConnection: false,
      hasGeminiCredential: false,
      chatUnlocked: false,
      geminiConnectionMode: "none",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return errorResponse(401, "Authentication required.");
    }

    return errorResponse(500, "Failed to remove Gemini credentials.");
  }
}
