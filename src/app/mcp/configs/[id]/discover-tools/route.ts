import {
  getMcpServerConfigByIdForUser,
  listToolSnapshotsForServer,
  replaceToolSnapshots,
} from "@/server/db";
import { requireCurrentUserForRoute } from "@/server/auth";
import { errorResponse, jsonResponse } from "@/server/http";
import { discoverToolsForConfig } from "@/server/mcp";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUserForRoute();
    const { id } = await context.params;
    const config = getMcpServerConfigByIdForUser(user.id, id);
    if (!config) {
      return errorResponse(404, "MCP config not found.");
    }

    const tools = await discoverToolsForConfig(config);
    replaceToolSnapshots(config.id, tools);

    return jsonResponse({
      tools: listToolSnapshotsForServer(config.id).map((snapshot) => ({
        id: snapshot.id,
        toolName: snapshot.toolName,
        description: snapshot.description,
        inputSchema: JSON.parse(snapshot.inputSchemaJson),
        discoveredAt: snapshot.discoveredAt,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return errorResponse(401, "Authentication required.");
    }

    return errorResponse(
      500,
      error instanceof Error ? error.message : "Tool discovery failed.",
    );
  }
}
