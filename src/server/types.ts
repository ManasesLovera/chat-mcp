export type UserRecord = {
  id: string;
  openaiUserId: string | null;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OpenAISessionRecord = {
  id: string;
  userId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MCPTransportType = "stdio" | "http";

export type MCPServerConfigRecord = {
  id: string;
  userId: string;
  name: string;
  transportType: MCPTransportType;
  command: string | null;
  args: string[];
  env: Record<string, string>;
  workingDirectory: string | null;
  url: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MCPToolSnapshotRecord = {
  id: string;
  serverConfigId: string;
  toolName: string;
  description: string | null;
  inputSchemaJson: string;
  discoveredAt: string;
};

export type AgentConversationStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "timed_out";

export type AgentConversationRecord = {
  id: string;
  userId: string;
  title: string;
  prompt: string;
  finalAnswer: string | null;
  status: AgentConversationStatus;
  createdAt: string;
  lastMessageAt: string;
  completedAt: string | null;
};

export type ConversationMessageRole =
  | "system"
  | "user"
  | "assistant"
  | "tool";

export type ConversationMessageRecord = {
  id: string;
  conversationId: string;
  role: ConversationMessageRole;
  content: string;
  toolCallId: string | null;
  createdAt: string;
};

export type AgentToolCallStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "timed_out";

export type AgentToolSource = "mcp" | "web_search";

export type AgentToolCallRecord = {
  id: string;
  conversationId: string;
  serverConfigId: string | null;
  toolSource: AgentToolSource;
  toolName: string;
  inputJson: string;
  outputJson: string | null;
  status: AgentToolCallStatus;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type SearchResultItem = {
  title: string;
  url: string;
  snippet: string;
};

export type SearchResultPayload = {
  query: string;
  results: SearchResultItem[];
  summary: string;
};

export type DiscoveredTool = {
  name: string;
  description: string | null;
  inputSchema: unknown;
};
