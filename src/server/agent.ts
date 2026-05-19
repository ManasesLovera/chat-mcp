import { AGENT_MAX_TOOL_ROUNDS } from "@/server/env";
import {
  createAgentToolCall,
  createConversation,
  createConversationMessage,
  finishAgentToolCall,
  getConversationByIdForUser,
  getConversationDetailByIdForUser,
  getMcpServerConfigByIdForUser,
  listConversationMessages,
  listMcpServerConfigsByUserId,
  listToolCallsByConversationId,
  listToolSnapshotsForServer,
  replaceToolSnapshots,
  updateConversationResult,
  updateConversationThread,
} from "@/server/db";
import { callToolForConfig, discoverToolsForConfig } from "@/server/mcp";
import { createChatCompletion } from "@/server/openai";
import { duckDuckGoProvider } from "@/server/search";
import type {
  ConversationMessageRecord,
  DiscoveredTool,
  MCPServerConfigRecord,
} from "@/server/types";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

type ToolRegistryEntry = {
  publicName: string;
  toolName: string;
  serverConfigId: string | null;
  source: "mcp" | "web_search";
  description: string;
  inputSchema: Record<string, unknown>;
  invoke: (input: Record<string, unknown>) => Promise<unknown>;
};

function safeToolParameters(schema: unknown): Record<string, unknown> {
  if (
    typeof schema === "object" &&
    schema !== null &&
    !Array.isArray(schema)
  ) {
    return schema as Record<string, unknown>;
  }

  return {
    type: "object",
    additionalProperties: true,
  };
}

function makeToolName(prefix: string, toolName: string, index: number) {
  const normalized = toolName
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${prefix}_${index}_${normalized || "tool"}`.slice(0, 64);
}

function summarizeTitle(content: string) {
  const collapsed = content.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, 80) || "New chat";
}

function serializeToolOutput(output: unknown) {
  return typeof output === "string" ? output : JSON.stringify(output);
}

function buildModelHistory(messages: ConversationMessageRecord[]): ChatMessage[] {
  return messages.flatMap((message) => {
    if (message.role === "tool") {
      return [];
    }

    return [
      {
        role: message.role,
        content: message.content,
      } satisfies ChatMessage,
    ];
  });
}

async function ensureDiscoveredTools(config: MCPServerConfigRecord) {
  const existing = listToolSnapshotsForServer(config.id);
  if (existing.length > 0) {
    return existing.map((snapshot) => ({
      name: snapshot.toolName,
      description: snapshot.description,
      inputSchema: JSON.parse(snapshot.inputSchemaJson),
    })) satisfies DiscoveredTool[];
  }

  const discovered = await discoverToolsForConfig(config);
  replaceToolSnapshots(config.id, discovered);
  return discovered;
}

async function loadSelectedConfigs(
  userId: string,
  selectedConfigIds: string[],
  enableMcpTools: boolean,
) {
  if (!enableMcpTools) {
    return [];
  }

  const requestedIds =
    selectedConfigIds.length > 0
      ? selectedConfigIds
      : listMcpServerConfigsByUserId(userId)
          .filter((config) => config.isEnabled)
          .map((config) => config.id);

  const configs: MCPServerConfigRecord[] = [];
  for (const id of requestedIds) {
    const config = getMcpServerConfigByIdForUser(userId, id);
    if (!config) {
      throw new Error(`MCP config ${id} was not found for this user.`);
    }

    if (!config.isEnabled) {
      continue;
    }

    configs.push(config);
  }

  return configs;
}

function buildRegistry(
  toolSets: Array<{ config: MCPServerConfigRecord; tools: DiscoveredTool[] }>,
  enableWebSearch: boolean,
) {
  const registry = new Map<string, ToolRegistryEntry>();
  const toolDefinitions: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> = [];

  let counter = 1;
  for (const { config, tools } of toolSets) {
    for (const tool of tools) {
      const publicName = makeToolName(
        `mcp_${config.id.slice(0, 6)}`,
        tool.name,
        counter++,
      );
      const description = `${tool.description ?? "MCP tool"} [server: ${config.name}]`;
      const entry: ToolRegistryEntry = {
        publicName,
        toolName: tool.name,
        serverConfigId: config.id,
        source: "mcp",
        description,
        inputSchema: safeToolParameters(tool.inputSchema),
        invoke: (input) => callToolForConfig(config, tool.name, input),
      };
      registry.set(publicName, entry);
      toolDefinitions.push({
        type: "function",
        function: {
          name: publicName,
          description,
          parameters: entry.inputSchema,
        },
      });
    }
  }

  if (enableWebSearch) {
    const entry: ToolRegistryEntry = {
      publicName: "web_search",
      toolName: "web_search",
      serverConfigId: null,
      source: "web_search",
      description:
        "Search the web and return summarized title, URL, and snippet results.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to look up on the web.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
      invoke: async (input) => {
        const query =
          typeof input.query === "string" && input.query.trim()
            ? input.query.trim()
            : null;
        if (!query) {
          throw new Error("web_search requires a non-empty query string.");
        }

        return duckDuckGoProvider.search(query);
      },
    };
    registry.set(entry.publicName, entry);
    toolDefinitions.push({
      type: "function",
      function: {
        name: entry.publicName,
        description: entry.description,
        parameters: entry.inputSchema,
      },
    });
  }

  return { registry, toolDefinitions };
}

async function runToolLoop(input: {
  userId: string;
  conversationId: string;
  baseMessages: ChatMessage[];
  registry: Map<string, ToolRegistryEntry>;
  toolDefinitions: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
}) {
  const messages = [...input.baseMessages];
  let finalAnswer = "";
  let finalStatus: "completed" | "timed_out" = "completed";

  for (let round = 0; round < AGENT_MAX_TOOL_ROUNDS; round += 1) {
    const assistant = await createChatCompletion({
      userId: input.userId,
      messages,
      tools: input.toolDefinitions,
    });

    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: assistant.content ?? null,
    };

    if (assistant.tool_calls?.length) {
      assistantMessage.tool_calls = assistant.tool_calls;
    }
    messages.push(assistantMessage);

    if (!assistant.tool_calls?.length) {
      finalAnswer = assistant.content ?? "";
      break;
    }

    for (const toolCall of assistant.tool_calls) {
      const entry = input.registry.get(toolCall.function.name);
      if (!entry) {
        throw new Error(`Unknown tool requested by model: ${toolCall.function.name}`);
      }

      let parsedArguments: Record<string, unknown> = {};
      try {
        parsedArguments = JSON.parse(toolCall.function.arguments || "{}") as Record<
          string,
          unknown
        >;
      } catch {
        parsedArguments = {};
      }

      const toolCallId = createAgentToolCall({
        conversationId: input.conversationId,
        serverConfigId: entry.serverConfigId,
        toolSource: entry.source,
        toolName: entry.toolName,
        inputJson: JSON.stringify(parsedArguments),
      });

      try {
        const output = await entry.invoke(parsedArguments);
        const outputText = serializeToolOutput(output);
        finishAgentToolCall({
          id: toolCallId,
          status: "completed",
          outputJson: outputText,
        });
        createConversationMessage({
          conversationId: input.conversationId,
          role: "tool",
          content: outputText,
          toolCallId,
        });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: outputText,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected tool execution failure.";
        const outputText = JSON.stringify({ ok: false, error: message });
        finishAgentToolCall({
          id: toolCallId,
          status: "failed",
          errorMessage: message,
          outputJson: outputText,
        });
        createConversationMessage({
          conversationId: input.conversationId,
          role: "tool",
          content: outputText,
          toolCallId,
        });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: outputText,
        });
      }
    }
  }

  if (!finalAnswer) {
    finalStatus = "timed_out";
    finalAnswer =
      "The assistant reached the tool-call limit before producing a final answer.";
  }

  return { finalAnswer, finalStatus };
}

export async function runAgentTest(input: {
  userId: string;
  prompt: string;
  selectedConfigIds: string[];
  enableWebSearch: boolean;
}) {
  const conversation = createConversation(input.userId, input.prompt, "running");
  createConversationMessage({
    conversationId: conversation.id,
    role: "user",
    content: input.prompt,
  });

  try {
    const configs = await loadSelectedConfigs(
      input.userId,
      input.selectedConfigIds,
      true,
    );
    const toolSets = await Promise.all(
      configs.map(async (config) => ({
        config,
        tools: await ensureDiscoveredTools(config),
      })),
    );

    const { registry, toolDefinitions } = buildRegistry(toolSets, input.enableWebSearch);
    const { finalAnswer, finalStatus } = await runToolLoop({
      userId: input.userId,
      conversationId: conversation.id,
      baseMessages: [
        {
          role: "system",
          content:
            "You are testing local MCP tools in a controlled lab app. Use tools when they materially improve the answer, cite what tool output established, and keep final answers concise and factual.",
        },
        {
          role: "user",
          content: input.prompt,
        },
      ],
      registry,
      toolDefinitions,
    });

    createConversationMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: finalAnswer,
    });
    updateConversationResult(conversation.id, finalStatus, finalAnswer);

    return {
      conversation: {
        ...getConversationByIdForUser(input.userId, conversation.id)!,
      },
      toolCalls: listToolCallsByConversationId(conversation.id),
      finalAnswer,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected agent execution failure.";
    createConversationMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: message,
    });
    updateConversationResult(conversation.id, "failed", message);
    return {
      conversation: getConversationByIdForUser(input.userId, conversation.id)!,
      toolCalls: listToolCallsByConversationId(conversation.id),
      finalAnswer: message,
    };
  }
}

export async function runConversationTurn(input: {
  userId: string;
  conversationId: string;
  content: string;
  selectedConfigIds: string[];
  enableWebSearch: boolean;
  enableMcpTools: boolean;
}) {
  const conversation = getConversationByIdForUser(
    input.userId,
    input.conversationId,
  );
  if (!conversation) {
    throw new Error("Conversation not found.");
  }

  createConversationMessage({
    conversationId: conversation.id,
    role: "user",
    content: input.content,
  });

  const currentTitle =
    conversation.title === "New chat" || conversation.title === "Agent test"
      ? summarizeTitle(input.content)
      : conversation.title;
  updateConversationThread(conversation.id, {
    title: currentTitle,
    prompt: conversation.prompt || input.content,
    status: "running",
    completedAt: null,
    lastMessageAt: new Date().toISOString(),
  });

  try {
    const configs = await loadSelectedConfigs(
      input.userId,
      input.selectedConfigIds,
      input.enableMcpTools,
    );
    const toolSets = await Promise.all(
      configs.map(async (config) => ({
        config,
        tools: await ensureDiscoveredTools(config),
      })),
    );

    const { registry, toolDefinitions } = buildRegistry(
      toolSets,
      input.enableWebSearch,
    );
    const history = buildModelHistory(listConversationMessages(conversation.id));
    const { finalAnswer, finalStatus } = await runToolLoop({
      userId: input.userId,
      conversationId: conversation.id,
      baseMessages: [
        {
          role: "system",
          content:
            "You are a helpful chat assistant in a local ChatGPT-style app. Answer directly when possible. Use MCP or web search tools only when they materially improve the answer, and keep responses concise unless the user asks for depth.",
        },
        ...history,
      ],
      registry,
      toolDefinitions,
    });

    createConversationMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: finalAnswer,
    });
    updateConversationThread(conversation.id, {
      title: currentTitle,
      finalAnswer,
      status: finalStatus,
      completedAt:
        finalStatus === "completed" || finalStatus === "timed_out"
          ? new Date().toISOString()
          : null,
      lastMessageAt: new Date().toISOString(),
    });

    return getConversationDetailByIdForUser(input.userId, conversation.id)!;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected chat execution failure.";
    createConversationMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: message,
    });
    updateConversationThread(conversation.id, {
      title: currentTitle,
      finalAnswer: message,
      status: "failed",
      completedAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    });
    return getConversationDetailByIdForUser(input.userId, conversation.id)!;
  }
}
