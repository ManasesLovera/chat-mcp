import {
  createMcpServerConfig,
  listMcpServerConfigsByUserId,
} from "@/server/db";
import { requireCurrentUserForRoute } from "@/server/auth";
import { errorResponse, jsonResponse } from "@/server/http";
import { redactConfig } from "@/server/redaction";
import { normalizeMcpConfigInput } from "@/server/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireCurrentUserForRoute();
    return jsonResponse({
      configs: listMcpServerConfigsByUserId(user.id).map(redactConfig),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return errorResponse(401, "Authentication required.");
    }

    return errorResponse(500, "Failed to load MCP configs.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUserForRoute();
    const payload = await request.json();
    const config = createMcpServerConfig(normalizeMcpConfigInput(payload, user.id));
    return jsonResponse({ config: redactConfig(config) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return errorResponse(401, "Authentication required.");
    }

    return errorResponse(
      400,
      error instanceof Error ? error.message : "Failed to create MCP config.",
    );
  }
}
