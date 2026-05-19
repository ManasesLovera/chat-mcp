import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { MCP_PROTOCOL_VERSION, MCP_STARTUP_TIMEOUT_MS, MCP_TOOL_TIMEOUT_MS } from "@/server/env";
import type { DiscoveredTool, MCPServerConfigRecord } from "@/server/types";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
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

export class StdioMcpClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
    }
  >();
  private buffer = Buffer.alloc(0);
  private stderrBuffer = "";

  constructor(private readonly config: MCPServerConfigRecord) {}

  async connect() {
    if (this.config.transportType !== "stdio") {
      throw new Error("Only stdio MCP transport is implemented in this build.");
    }

    if (!this.config.command) {
      throw new Error("The stdio MCP server is missing a command.");
    }

    this.process = spawn(this.config.command, this.config.args, {
      cwd: this.config.workingDirectory ?? undefined,
      env: {
        ...process.env,
        ...this.config.env,
      },
      shell: false,
      stdio: "pipe",
    });

    this.process.stdout.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.flushBuffer();
    });

    this.process.stderr.on("data", (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString("utf8");
      if (this.stderrBuffer.length > 4000) {
        this.stderrBuffer = this.stderrBuffer.slice(-4000);
      }
    });

    this.process.on("error", (error) => {
      this.rejectAll(error);
    });

    this.process.on("exit", (code, signal) => {
      const message = `MCP process exited unexpectedly (code=${code}, signal=${signal}). ${this.stderrBuffer.trim()}`.trim();
      this.rejectAll(new Error(message));
    });

    await withTimeout(
      this.request("initialize", {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "local-mcp-agent-lab",
          version: "0.1.0",
        },
      }),
      MCP_STARTUP_TIMEOUT_MS,
      "MCP initialize",
    );

    this.notify("initialized", {});
  }

  async listTools() {
    const result = (await withTimeout(
      this.request("tools/list", {}),
      MCP_TOOL_TIMEOUT_MS,
      "MCP tools/list",
    )) as {
      tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: unknown;
      }>;
    };

    return (result.tools ?? []).map<DiscoveredTool>((tool) => ({
      name: tool.name,
      description: tool.description ?? null,
      inputSchema: tool.inputSchema ?? { type: "object", additionalProperties: true },
    }));
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
    this.process?.kill();
    this.process = null;
  }

  private notify(method: string, params?: unknown) {
    this.send({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  private request(method: string, params?: unknown) {
    const id = this.nextId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.send({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    return promise;
  }

  private send(payload: JsonRpcRequest) {
    if (!this.process) {
      throw new Error("MCP process is not connected.");
    }

    const body = Buffer.from(JSON.stringify(payload), "utf8");
    const header = Buffer.from(`Content-Length: ${body.byteLength}\r\n\r\n`, "utf8");
    this.process.stdin.write(Buffer.concat([header, body]));
  }

  private flushBuffer() {
    while (this.buffer.length > 0) {
      const headerBoundary = this.findHeaderBoundary(this.buffer);

      if (headerBoundary >= 0) {
        const header = this.buffer.slice(0, headerBoundary).toString("utf8");
        const match = header.match(/content-length:\s*(\d+)/i);
        if (!match) {
          throw new Error("MCP response is missing a Content-Length header.");
        }

        const length = Number(match[1]);
        const bodyStart = headerBoundary + (header.includes("\r\n\r\n") ? 4 : 2);
        if (this.buffer.length < bodyStart + length) {
          return;
        }

        const body = this.buffer.slice(bodyStart, bodyStart + length);
        this.buffer = this.buffer.slice(bodyStart + length);
        this.handleMessage(body.toString("utf8"));
        continue;
      }

      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex === -1) {
        return;
      }

      const line = this.buffer.slice(0, newlineIndex).toString("utf8").trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.startsWith("{")) {
        this.handleMessage(line);
      }
    }
  }

  private findHeaderBoundary(buffer: Buffer) {
    const crlf = buffer.indexOf("\r\n\r\n");
    if (crlf >= 0) {
      return crlf;
    }

    return buffer.indexOf("\n\n");
  }

  private handleMessage(raw: string) {
    const message = JSON.parse(raw) as JsonRpcRequest;
    if (typeof message.id !== "number") {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }

    pending.resolve(message.result);
  }

  private rejectAll(reason: unknown) {
    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      pending.reject(reason);
    }
  }
}

export async function withStdioMcpClient<T>(
  config: MCPServerConfigRecord,
  fn: (client: StdioMcpClient) => Promise<T>,
) {
  const client = new StdioMcpClient(config);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}
