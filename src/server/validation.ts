import fs from "node:fs";
import path from "node:path";
import type { MCPServerConfigRecord, MCPTransportType } from "@/server/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string.`);
  }

  return value.trim();
}

function optionalString(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Expected a string value.");
  }

  return value.trim() || null;
}

function parseArgs(value: unknown) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("args must be an array of strings.");
  }

  return value;
}

function parseEnv(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("env must be an object of string values.");
  }

  const normalized: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      throw new Error(`env.${key} must be a string.`);
    }

    normalized[key] = entry;
  }

  return normalized;
}

function validateWorkingDirectory(value: string | null) {
  if (!value) {
    return null;
  }

  const resolved = path.resolve(value);
  const stat = fs.existsSync(resolved) ? fs.statSync(resolved) : null;
  if (!stat || !stat.isDirectory()) {
    throw new Error("workingDirectory must point to an existing directory.");
  }

  return resolved;
}

export function normalizeMcpConfigInput(
  payload: unknown,
  userId: string,
): Omit<MCPServerConfigRecord, "id" | "createdAt" | "updatedAt"> {
  if (!isRecord(payload)) {
    throw new Error("Request body must be an object.");
  }

  const transportType = requireString(payload.transportType, "transportType");
  if (transportType !== "stdio" && transportType !== "http") {
    throw new Error('transportType must be "stdio" or "http".');
  }

  const normalizedTransport = transportType as MCPTransportType;
  const command = optionalString(payload.command);
  const workingDirectory = validateWorkingDirectory(optionalString(payload.workingDirectory));
  const url = optionalString(payload.url);
  const args = parseArgs(payload.args ?? []);
  const env = parseEnv(payload.env ?? {});
  const isEnabled = Boolean(payload.isEnabled ?? true);
  const name = requireString(payload.name, "name");

  if (normalizedTransport === "stdio" && !command) {
    throw new Error("command is required for stdio MCP servers.");
  }

  if (normalizedTransport === "http" && !url) {
    throw new Error("url is required for HTTP MCP servers.");
  }

  return {
    userId,
    name,
    transportType: normalizedTransport,
    command,
    args,
    env,
    workingDirectory,
    url,
    isEnabled,
  };
}

export function normalizeToolCallInput(payload: unknown) {
  if (!isRecord(payload)) {
    throw new Error("Request body must be an object.");
  }

  const toolName = requireString(payload.toolName, "toolName");
  const args = isRecord(payload.arguments) ? payload.arguments : {};
  return { toolName, args };
}

export function normalizeAgentTestInput(payload: unknown) {
  if (!isRecord(payload)) {
    throw new Error("Request body must be an object.");
  }

  const prompt = requireString(payload.prompt, "prompt");
  const selectedConfigIds = Array.isArray(payload.selectedConfigIds)
    ? payload.selectedConfigIds.filter((item): item is string => typeof item === "string")
    : [];

  return {
    prompt,
    selectedConfigIds,
    enableWebSearch: Boolean(payload.enableWebSearch ?? true),
  };
}

export function normalizeConversationMessageInput(payload: unknown) {
  if (!isRecord(payload)) {
    throw new Error("Request body must be an object.");
  }

  const content = requireString(payload.content, "content");
  const selectedConfigIds = Array.isArray(payload.selectedConfigIds)
    ? payload.selectedConfigIds.filter((item): item is string => typeof item === "string")
    : [];

  return {
    content,
    selectedConfigIds,
    enableWebSearch: Boolean(payload.enableWebSearch ?? true),
    enableMcpTools: Boolean(payload.enableMcpTools ?? false),
  };
}
