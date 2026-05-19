import {
  getMcpServerConfigByIdForUser,
  deleteMcpServerConfig,
  updateMcpServerConfig,
} from "@/server/db";
import { requireCurrentUserForRoute } from "@/server/auth";
import { errorResponse, jsonResponse } from "@/server/http";
import { redactConfig } from "@/server/redaction";
import { normalizeMcpConfigInput } from "@/server/validation";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUserForRoute();
    const { id } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    const existing = getMcpServerConfigByIdForUser(user.id, id);
    if (!existing) {
      return errorResponse(404, "MCP config not found.");
    }

    if (payload.env === undefined) {
      payload.env = existing.env;
    }

    const normalized = normalizeMcpConfigInput(payload, user.id);
    const updated = updateMcpServerConfig(user.id, id, {
      name: normalized.name,
      transportType: normalized.transportType,
      command: normalized.command,
      args: normalized.args,
      env: normalized.env,
      workingDirectory: normalized.workingDirectory,
      url: normalized.url,
      isEnabled: normalized.isEnabled,
    });

    return jsonResponse({ config: redactConfig(updated!) });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return errorResponse(401, "Authentication required.");
    }

    return errorResponse(
      400,
      error instanceof Error ? error.message : "Failed to update MCP config.",
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUserForRoute();
    const { id } = await context.params;
    deleteMcpServerConfig(user.id, id);
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return errorResponse(401, "Authentication required.");
    }

    return errorResponse(500, "Failed to delete MCP config.");
  }
}
