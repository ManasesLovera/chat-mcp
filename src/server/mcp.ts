import type { MCPServerConfigRecord } from "@/server/types";
import { withHttpMcpClient } from "@/server/mcp/http-client";
import { withStdioMcpClient } from "@/server/mcp/client";

export async function discoverToolsForConfig(config: MCPServerConfigRecord) {
  if (config.transportType === "stdio") {
    return withStdioMcpClient(config, (client) => client.listTools());
  }

  return withHttpMcpClient(config, (client) => client.listTools());
}

export async function callToolForConfig(
  config: MCPServerConfigRecord,
  toolName: string,
  args: Record<string, unknown>,
) {
  if (config.transportType === "stdio") {
    return withStdioMcpClient(config, (client) => client.callTool(toolName, args));
  }

  return withHttpMcpClient(config, (client) => client.callTool(toolName, args));
}
