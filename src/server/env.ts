import path from "node:path";

export const APP_NAME = "Local MCP Agent Lab";
export const DATABASE_PATH =
  process.env.APP_DATABASE_PATH ??
  path.join(process.cwd(), "data", "local-mcp-agent-lab.sqlite");
export const APP_ENCRYPTION_SECRET =
  process.env.APP_ENCRYPTION_SECRET ??
  "dev-only-change-me-local-mcp-agent-lab-secret";
export const AUTH_COOKIE_NAME = "mcp_agent_lab_session";
export const LOGIN_STATE_COOKIE_NAME = "mcp_agent_lab_login_state";
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1";
export const MCP_PROTOCOL_VERSION = "2024-11-05";
export const MCP_HTTP_PROTOCOL_VERSION = "2025-06-18";
export const MCP_STARTUP_TIMEOUT_MS = Number(
  process.env.MCP_STARTUP_TIMEOUT_MS ?? 8000,
);
export const MCP_TOOL_TIMEOUT_MS = Number(
  process.env.MCP_TOOL_TIMEOUT_MS ?? 20000,
);
export const AGENT_MAX_TOOL_ROUNDS = Number(
  process.env.AGENT_MAX_TOOL_ROUNDS ?? 8,
);
