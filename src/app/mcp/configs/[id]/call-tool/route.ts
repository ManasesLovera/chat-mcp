import { getMcpServerConfigByIdForUser } from "@/server/db";
import { requireCurrentUserForRoute } from "@/server/auth";
import { errorResponse, jsonResponse } from "@/server/http";
import { callToolForConfig } from "@/server/mcp";
import { normalizeToolCallInput } from "@/server/validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUserForRoute();
    const { id } = await context.params;
    const config = getMcpServerConfigByIdForUser(user.id, id);
    if (!config) {
      return errorResponse(404, "MCP config not found.");
    }

    const { toolName, args } = normalizeToolCallInput(await request.json());
    const output = await callToolForConfig(config, toolName, args);

    return jsonResponse({
      toolName,
      output,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return errorResponse(401, "Authentication required.");
    }

    return errorResponse(
      400,
      error instanceof Error ? error.message : "Tool execution failed.",
    );
  }
}
