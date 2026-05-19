import type { MCPServerConfigRecord } from "@/server/types";
import { withStdioMcpClient } from "@/server/mcp/client";

export async function discoverToolsForConfig(config: MCPServerConfigRecord) {
  if (config.transportType !== "stdio") {
    throw new Error("HTTP MCP transport is not implemented yet.");
  }

  return withStdioMcpClient(config, (client) => client.listTools());
}

export async function callToolForConfig(
  config: MCPServerConfigRecord,
  toolName: string,
  args: Record<string, unknown>,
) {
  if (config.transportType !== "stdio") {
    throw new Error("HTTP MCP transport is not implemented yet.");
  }

  return withStdioMcpClient(config, (client) => client.callTool(toolName, args));
}
