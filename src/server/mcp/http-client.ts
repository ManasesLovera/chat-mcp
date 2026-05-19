import {
  MCP_HTTP_PROTOCOL_VERSION,
  MCP_STARTUP_TIMEOUT_MS,
  MCP_TOOL_TIMEOUT_MS,
} from "@/server/env";
import type { DiscoveredTool, MCPServerConfigRecord } from "@/server/types";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  method?: string;
  params?: unknown;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms.`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonRpcResponse(value: unknown): JsonRpcResponse | null {
  if (!isRecord(value) || value.jsonrpc !== "2.0") {
    return null;
  }

  return value as JsonRpcResponse;
}

function parseJsonRpcText(raw: string) {
  return parseJsonRpcResponse(JSON.parse(raw));
}

function eventBlockToJsonRpc(block: string) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();

  if (!data) {
    return null;
  }

  return parseJsonRpcText(data);
}

function splitSseBlock(buffer: string) {
  const crlf = buffer.indexOf("\r\n\r\n");
  if (crlf >= 0) {
    return {
      block: buffer.slice(0, crlf),
      rest: buffer.slice(crlf + 4),
    };
  }

  const lf = buffer.indexOf("\n\n");
  if (lf >= 0) {
    return {
      block: buffer.slice(0, lf),
      rest: buffer.slice(lf + 2),
    };
  }

  return null;
}

async function readSseResponse(response: Response, requestId: number) {
  if (!response.body) {
    throw new Error("MCP server returned an empty SSE response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
      }

      while (true) {
        const split = splitSseBlock(buffer);
        if (!split) {
          break;
        }

        buffer = split.rest;
        const message = eventBlockToJsonRpc(split.block);
        if (!message) {
          continue;
        }

        if (message.id === requestId) {
          return message;
        }

        if (typeof message.id === "number" && message.id !== requestId) {
          throw new Error("MCP server sent an unexpected request over SSE.");
        }
      }

      if (done) {
        break;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore cleanup errors.
    }
  }

  throw new Error("MCP server did not return a response before closing SSE.");
}

export class StreamableHttpMcpClient {
  private nextId = 1;
  private sessionId: string | null = null;
  private protocolVersion = MCP_HTTP_PROTOCOL_VERSION;
  private connected = false;

  constructor(private readonly config: MCPServerConfigRecord) {}

  async connect() {
    if (!this.config.url) {
      throw new Error("The HTTP MCP server is missing a URL.");
    }

    if (!/^https?:\/\//i.test(this.config.url)) {
      throw new Error("HTTP MCP server URL must start with http:// or https://.");
    }

    await withTimeout(this.initialize(), MCP_STARTUP_TIMEOUT_MS, "MCP initialize");
    this.connected = true;
  }

  async listTools() {
    const result = await withTimeout(
      this.request("tools/list", {}),
      MCP_TOOL_TIMEOUT_MS,
      "MCP tools/list",
    );

    const tools = isRecord(result) && Array.isArray(result.tools) ? result.tools : [];

    const discovered: DiscoveredTool[] = [];
    for (const tool of tools) {
      if (!isRecord(tool) || typeof tool.name !== "string") {
        continue;
      }

      discovered.push({
        name: tool.name,
        description: typeof tool.description === "string" ? tool.description : null,
        inputSchema: tool.inputSchema ?? { type: "object", additionalProperties: true },
      });
    }

    return discovered;
  }

  async callTool(name: string, args: Record<string, unknown>) {
    return withTimeout(
      this.request("tools/call", {
        name,
        arguments: args,
      }),
      MCP_TOOL_TIMEOUT_MS,
      `MCP tools/call:${name}`,
    );
  }

  async close() {
    if (!this.connected || !this.sessionId || !this.config.url) {
      return;
    }

    try {
      await fetch(this.config.url, {
        method: "DELETE",
        headers: this.buildHeaders(),
      });
    } catch {
      // Best-effort cleanup only.
    }
  }

  private buildHeaders() {
    const headers: Record<string, string> = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": this.protocolVersion,
    };

    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    return headers;
  }

  private async initialize() {
    const requestId = this.nextId++;
    const response = await this.sendRequest({
      jsonrpc: "2.0",
      id: requestId,
      method: "initialize",
      params: {
        protocolVersion: this.protocolVersion,
        capabilities: {},
        clientInfo: {
          name: "local-mcp-agent-lab",
          version: "0.1.0",
        },
      },
    });

    const message = await this.parseResponse(response, requestId);
    const result = isRecord(message.result) ? message.result : null;
    if (result && typeof result.protocolVersion === "string") {
      this.protocolVersion = result.protocolVersion;
    }

    const sessionId = response.headers.get("Mcp-Session-Id");
    if (sessionId) {
      this.sessionId = sessionId;
    }

    await this.sendNotification("notifications/initialized", {});
  }

  private async sendNotification(method: string, params?: unknown) {
    const response = await this.postJson({
      jsonrpc: "2.0",
      method,
      params,
    });

    if (response.status === 202) {
      return;
    }

    if (!response.ok) {
      throw await this.readErrorResponse(response, `MCP notification ${method}`);
    }
  }

  private async request(method: string, params?: unknown) {
    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: this.nextId++,
      method,
      params,
    };

    const response = await this.sendRequest(payload);
    const message = await this.parseResponse(response, payload.id!);

    if (message.error) {
      throw new Error(message.error.message);
    }

    return message.result;
  }

  private async sendRequest(payload: JsonRpcRequest): Promise<Response> {
    const response = await this.postJson(payload);

    if (response.ok || response.status === 202) {
      return response;
    }

    if (response.status === 404 && this.sessionId) {
      this.sessionId = null;
      await this.initialize();
      return this.sendRequest(payload);
    }

    if (
      response.status === 400 &&
      payload.method === "initialize" &&
      this.protocolVersion !== "2024-11-05"
    ) {
      const text = await response.text();
      if (/protocol|version|unsupported/i.test(text)) {
        this.protocolVersion = "2024-11-05";
        return this.sendRequest(payload);
      }
    }

    throw await this.readErrorResponse(response, `MCP ${payload.method}`);
  }

  private async postJson(payload: JsonRpcRequest) {
    if (!this.config.url) {
      throw new Error("The HTTP MCP server is missing a URL.");
    }

    return fetch(this.config.url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(payload),
    });
  }

  private async parseResponse(
    response: Response,
    requestId: number,
  ): Promise<JsonRpcResponse> {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      return readSseResponse(response, requestId);
    }

    const text = await response.text();
    if (!text.trim()) {
      return { jsonrpc: "2.0", id: requestId, result: null };
    }

    const parsed = parseJsonRpcText(text.trim());
    if (!parsed) {
      throw new Error("MCP server returned an invalid JSON response.");
    }

    if (typeof parsed.id !== "number" || parsed.id !== requestId) {
      throw new Error("MCP server returned a mismatched response id.");
    }

    return parsed;
  }

  private async readErrorResponse(response: Response, label: string) {
    const text = await response.text();
    const detail = text.trim();
    if (!detail) {
      return new Error(`${label} failed with HTTP ${response.status}.`);
    }

    try {
      const parsed = parseJsonRpcText(detail);
      if (parsed?.error?.message) {
        return new Error(parsed.error.message);
      }
    } catch {
      // Fall back to the raw body.
    }

    return new Error(`${label} failed with HTTP ${response.status}: ${detail}`);
  }
}

export async function withHttpMcpClient<T>(
  config: MCPServerConfigRecord,
  fn: (client: StreamableHttpMcpClient) => Promise<T>,
) {
  const client = new StreamableHttpMcpClient(config);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}
