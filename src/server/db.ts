import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { decryptJson, encryptJson, encryptText } from "@/server/crypto";
import { DATABASE_PATH } from "@/server/env";
import type {
  AgentConversationRecord,
  AgentConversationStatus,
  AgentToolCallRecord,
  AgentToolCallStatus,
  AgentToolSource,
  ConversationMessageRecord,
  DiscoveredTool,
  MCPServerConfigRecord,
  MCPToolSnapshotRecord,
  OpenAISessionRecord,
  UserRecord,
} from "@/server/types";

type DbRow = Record<string, unknown>;

type Migration = {
  id: string;
  sql: string;
};

const MIGRATIONS: Migration[] = [
  {
    id: "001_initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        openai_user_id TEXT,
        email TEXT,
        display_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS openai_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        access_token_encrypted TEXT NOT NULL,
        refresh_token_encrypted TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS mcp_server_configs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        transport_type TEXT NOT NULL,
        command TEXT,
        args_json TEXT NOT NULL,
        env_json TEXT NOT NULL,
        working_directory TEXT,
        url TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS mcp_tool_snapshots (
        id TEXT PRIMARY KEY,
        server_config_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        description TEXT,
        input_schema_json TEXT NOT NULL,
        discovered_at TEXT NOT NULL,
        FOREIGN KEY (server_config_id) REFERENCES mcp_server_configs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS agent_conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        final_answer TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS agent_tool_calls (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        server_config_id TEXT,
        tool_source TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input_json TEXT NOT NULL,
        output_json TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (server_config_id) REFERENCES mcp_server_configs(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_mcp_server_configs_user_id
        ON mcp_server_configs (user_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_tool_snapshots_server_config_id
        ON mcp_tool_snapshots (server_config_id);
      CREATE INDEX IF NOT EXISTS idx_agent_conversations_user_id
        ON agent_conversations (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_conversation_id
        ON agent_tool_calls (conversation_id, started_at ASC);
    `,
  },
  {
    id: "002_chat_threads",
    sql: `
      ALTER TABLE agent_conversations ADD COLUMN last_message_at TEXT;

      UPDATE agent_conversations
      SET last_message_at = COALESCE(completed_at, created_at)
      WHERE last_message_at IS NULL;

      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_call_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (tool_call_id) REFERENCES agent_tool_calls(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id
        ON conversation_messages (conversation_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_agent_conversations_last_message_at
        ON agent_conversations (user_id, last_message_at DESC);
    `,
  },
  {
    id: "003_gemini_sessions",
    sql: `
      CREATE TABLE IF NOT EXISTS gemini_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        access_token_encrypted TEXT NOT NULL,
        refresh_token_encrypted TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `,
  },
];

const db = createDatabase();

function createDatabase() {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
  const database = new Database(DATABASE_PATH);
  database.exec("PRAGMA foreign_keys = ON;");
  applyMigrations(database);
  return database;
}

function applyMigrations(database: Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const existing = new Set(
    (database
      .prepare("SELECT id FROM schema_migrations")
      .all() as DbRow[])
      .map((row: DbRow) => String(row.id)),
  );

  for (const migration of MIGRATIONS) {
    if (existing.has(migration.id)) {
      continue;
    }

    database.exec("BEGIN");
    try {
      database.exec(migration.sql);
      database
        .prepare(
          "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
        )
        .run(migration.id, nowIso());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapUser(row: DbRow | undefined): UserRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    openaiUserId: row.openai_user_id ? String(row.openai_user_id) : null,
    email: row.email ? String(row.email) : null,
    displayName: row.display_name ? String(row.display_name) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapOpenAISession(row: DbRow | undefined): OpenAISessionRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    accessTokenEncrypted: String(row.access_token_encrypted),
    refreshTokenEncrypted: row.refresh_token_encrypted
      ? String(row.refresh_token_encrypted)
      : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapGeminiSession(row: DbRow | undefined): GeminiSessionRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    accessTokenEncrypted: String(row.access_token_encrypted),
    refreshTokenEncrypted: row.refresh_token_encrypted
      ? String(row.refresh_token_encrypted)
      : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapConfig(row: DbRow | undefined): MCPServerConfigRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    transportType: String(row.transport_type) as MCPServerConfigRecord["transportType"],
    command: row.command ? String(row.command) : null,
    args: parseJson<string[]>(row.args_json, []),
    env: decryptJson<Record<string, string>>(String(row.env_json)),
    workingDirectory: row.working_directory ? String(row.working_directory) : null,
    url: row.url ? String(row.url) : null,
    isEnabled: Number(row.is_enabled) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapToolSnapshot(row: DbRow): MCPToolSnapshotRecord {
  return {
    id: String(row.id),
    serverConfigId: String(row.server_config_id),
    toolName: String(row.tool_name),
    description: row.description ? String(row.description) : null,
    inputSchemaJson: String(row.input_schema_json),
    discoveredAt: String(row.discovered_at),
  };
}

function mapConversation(row: DbRow): AgentConversationRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    title: String(row.title),
    prompt: String(row.prompt),
    finalAnswer: row.final_answer ? String(row.final_answer) : null,
    status: String(row.status) as AgentConversationStatus,
    createdAt: String(row.created_at),
    lastMessageAt: row.last_message_at
      ? String(row.last_message_at)
      : String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function mapConversationMessage(row: DbRow): ConversationMessageRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    role: String(row.role) as ConversationMessageRecord["role"],
    content: String(row.content),
    toolCallId: row.tool_call_id ? String(row.tool_call_id) : null,
    createdAt: String(row.created_at),
  };
}

function mapToolCall(row: DbRow): AgentToolCallRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    serverConfigId: row.server_config_id ? String(row.server_config_id) : null,
    toolSource: String(row.tool_source) as AgentToolSource,
    toolName: String(row.tool_name),
    inputJson: String(row.input_json),
    outputJson: row.output_json ? String(row.output_json) : null,
    status: String(row.status) as AgentToolCallStatus,
    errorMessage: row.error_message ? String(row.error_message) : null,
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : null,
  };
}

export function createUser() {
  const id = randomUUID();
  const timestamp = nowIso();
  db.prepare(
    `
      INSERT INTO users (id, openai_user_id, email, display_name, created_at, updated_at)
      VALUES (?, NULL, NULL, NULL, ?, ?)
    `,
  ).run(id, timestamp, timestamp);

  return getUserById(id)!;
}

export function getUserById(id: string) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | DbRow
    | undefined;
  return mapUser(row);
}

export function getOpenAISessionByUserId(userId: string) {
  const row = db
    .prepare("SELECT * FROM openai_sessions WHERE user_id = ?")
    .get(userId) as DbRow | undefined;
  return mapOpenAISession(row);
}

export function upsertOpenAISession(userId: string, accessToken: string) {
  const existing = getOpenAISessionByUserId(userId);
  const timestamp = nowIso();
  const encryptedToken = encryptText(accessToken);

  if (existing) {
    db.prepare(
      `
        UPDATE openai_sessions
        SET access_token_encrypted = ?, refresh_token_encrypted = NULL, expires_at = NULL, updated_at = ?
        WHERE user_id = ?
      `,
    ).run(encryptedToken, timestamp, userId);

    return getOpenAISessionByUserId(userId)!;
  }

  const id = randomUUID();
  db.prepare(
    `
      INSERT INTO openai_sessions (
        id, user_id, access_token_encrypted, refresh_token_encrypted, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, NULL, ?, ?)
    `,
  ).run(id, userId, encryptedToken, timestamp, timestamp);

  return getOpenAISessionByUserId(userId)!;
}

export function deleteOpenAISession(userId: string) {
  db.prepare("DELETE FROM openai_sessions WHERE user_id = ?").run(userId);
}

export function getGeminiSessionByUserId(userId: string) {
  const row = db
    .prepare("SELECT * FROM gemini_sessions WHERE user_id = ?")
    .get(userId) as DbRow | undefined;
  return mapGeminiSession(row);
}

export function upsertGeminiSession(userId: string, accessToken: string) {
  const existing = getGeminiSessionByUserId(userId);
  const timestamp = nowIso();
  const encryptedToken = encryptText(accessToken);

  if (existing) {
    db.prepare(
      `
        UPDATE gemini_sessions
        SET access_token_encrypted = ?, refresh_token_encrypted = NULL, expires_at = NULL, updated_at = ?
        WHERE user_id = ?
      `,
    ).run(encryptedToken, timestamp, userId);

    return getGeminiSessionByUserId(userId)!;
  }

  const id = randomUUID();
  db.prepare(
    `
      INSERT INTO gemini_sessions (
        id, user_id, access_token_encrypted, refresh_token_encrypted, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, NULL, ?, ?)
    `,
  ).run(id, userId, encryptedToken, timestamp, timestamp);

  return getGeminiSessionByUserId(userId)!;
}

export function deleteGeminiSession(userId: string) {
  db.prepare("DELETE FROM gemini_sessions WHERE user_id = ?").run(userId);
}

export function listMcpServerConfigsByUserId(userId: string) {
  const rows = db
    .prepare(
      "SELECT * FROM mcp_server_configs WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC",
    )
    .all(userId) as DbRow[];
  return rows.map((row) => mapConfig(row)!);
}

export function getMcpServerConfigByIdForUser(userId: string, id: string) {
  const row = db
    .prepare("SELECT * FROM mcp_server_configs WHERE user_id = ? AND id = ?")
    .get(userId, id) as DbRow | undefined;
  return mapConfig(row);
}

export function createMcpServerConfig(
  input: Omit<MCPServerConfigRecord, "id" | "createdAt" | "updatedAt">,
) {
  const id = randomUUID();
  const timestamp = nowIso();
  db.prepare(
    `
      INSERT INTO mcp_server_configs (
        id, user_id, name, transport_type, command, args_json, env_json,
        working_directory, url, is_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    input.userId,
    input.name,
    input.transportType,
    input.command,
    JSON.stringify(input.args),
    encryptJson(input.env),
    input.workingDirectory,
    input.url,
    input.isEnabled ? 1 : 0,
    timestamp,
    timestamp,
  );

  return getMcpServerConfigByIdForUser(input.userId, id)!;
}

export function updateMcpServerConfig(
  userId: string,
  id: string,
  input: Omit<MCPServerConfigRecord, "id" | "createdAt" | "updatedAt" | "userId">,
) {
  db.prepare(
    `
      UPDATE mcp_server_configs
      SET
        name = ?,
        transport_type = ?,
        command = ?,
        args_json = ?,
        env_json = ?,
        working_directory = ?,
        url = ?,
        is_enabled = ?,
        updated_at = ?
      WHERE user_id = ? AND id = ?
    `,
  ).run(
    input.name,
    input.transportType,
    input.command,
    JSON.stringify(input.args),
    encryptJson(input.env),
    input.workingDirectory,
    input.url,
    input.isEnabled ? 1 : 0,
    nowIso(),
    userId,
    id,
  );

  return getMcpServerConfigByIdForUser(userId, id);
}

export function deleteMcpServerConfig(userId: string, id: string) {
  db.prepare("DELETE FROM mcp_server_configs WHERE user_id = ? AND id = ?").run(
    userId,
    id,
  );
}

export function replaceToolSnapshots(serverConfigId: string, tools: DiscoveredTool[]) {
  const discoveredAt = nowIso();
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM mcp_tool_snapshots WHERE server_config_id = ?").run(
      serverConfigId,
    );

    const statement = db.prepare(
      `
        INSERT INTO mcp_tool_snapshots (
          id, server_config_id, tool_name, description, input_schema_json, discovered_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
    );

    for (const tool of tools) {
      statement.run(
        randomUUID(),
        serverConfigId,
        tool.name,
        tool.description,
        JSON.stringify(tool.inputSchema ?? { type: "object", additionalProperties: true }),
        discoveredAt,
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listToolSnapshotsForServer(serverConfigId: string) {
  const rows = db
    .prepare(
      "SELECT * FROM mcp_tool_snapshots WHERE server_config_id = ? ORDER BY tool_name ASC",
    )
    .all(serverConfigId) as DbRow[];
  return rows.map(mapToolSnapshot);
}

export function listToolSnapshotsForServers(serverConfigIds: string[]) {
  if (serverConfigIds.length === 0) {
    return [];
  }

  const placeholders = serverConfigIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT * FROM mcp_tool_snapshots WHERE server_config_id IN (${placeholders}) ORDER BY tool_name ASC`,
    )
    .all(...serverConfigIds) as DbRow[];
  return rows.map(mapToolSnapshot);
}

export function createConversation(
  userId: string,
  prompt: string,
  status: AgentConversationStatus,
) {
  const id = randomUUID();
  const timestamp = nowIso();
  const title = prompt.trim().slice(0, 80) || "Agent test";
  db.prepare(
    `
      INSERT INTO agent_conversations (
        id, user_id, title, prompt, final_answer, status, created_at, last_message_at, completed_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL)
    `,
  ).run(id, userId, title, prompt, status, timestamp, timestamp);

  return getConversationById(id)!;
}

export function updateConversationResult(
  conversationId: string,
  status: AgentConversationStatus,
  finalAnswer: string | null,
) {
  db.prepare(
    `
      UPDATE agent_conversations
      SET status = ?, final_answer = ?, completed_at = ?, last_message_at = ?
      WHERE id = ?
    `,
  ).run(status, finalAnswer, nowIso(), nowIso(), conversationId);
}

export function getConversationById(id: string) {
  const row = db
    .prepare("SELECT * FROM agent_conversations WHERE id = ?")
    .get(id) as DbRow | undefined;
  return row ? mapConversation(row) : null;
}

export function listConversationsByUserId(userId: string) {
  const rows = db
    .prepare(
      "SELECT * FROM agent_conversations WHERE user_id = ? ORDER BY COALESCE(last_message_at, created_at) DESC",
    )
    .all(userId) as DbRow[];
  return rows.map(mapConversation);
}

export function getConversationByIdForUser(userId: string, id: string) {
  const row = db
    .prepare(
      "SELECT * FROM agent_conversations WHERE user_id = ? AND id = ?",
    )
    .get(userId, id) as DbRow | undefined;
  return row ? mapConversation(row) : null;
}

export function createConversationThread(userId: string, title = "New chat") {
  const id = randomUUID();
  const timestamp = nowIso();
  db.prepare(
    `
      INSERT INTO agent_conversations (
        id, user_id, title, prompt, final_answer, status, created_at, last_message_at, completed_at
      ) VALUES (?, ?, ?, '', NULL, 'completed', ?, ?, NULL)
    `,
  ).run(id, userId, title, timestamp, timestamp);

  return getConversationById(id)!;
}

export function updateConversationThread(
  conversationId: string,
  input: {
    title?: string;
    prompt?: string;
    finalAnswer?: string | null;
    status?: AgentConversationStatus;
    completedAt?: string | null;
    lastMessageAt?: string;
  },
) {
  const current = getConversationById(conversationId);
  if (!current) {
    return null;
  }

  db.prepare(
    `
      UPDATE agent_conversations
      SET
        title = ?,
        prompt = ?,
        final_answer = ?,
        status = ?,
        completed_at = ?,
        last_message_at = ?
      WHERE id = ?
    `,
  ).run(
    input.title ?? current.title,
    input.prompt ?? current.prompt,
    input.finalAnswer === undefined ? current.finalAnswer : input.finalAnswer,
    input.status ?? current.status,
    input.completedAt === undefined ? current.completedAt : input.completedAt,
    input.lastMessageAt ?? nowIso(),
    conversationId,
  );

  return getConversationById(conversationId);
}

export function createConversationMessage(input: {
  conversationId: string;
  role: ConversationMessageRecord["role"];
  content: string;
  toolCallId?: string | null;
  createdAt?: string;
}) {
  const id = randomUUID();
  const timestamp = input.createdAt ?? nowIso();
  db.prepare(
    `
      INSERT INTO conversation_messages (
        id, conversation_id, role, content, tool_call_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    input.conversationId,
    input.role,
    input.content,
    input.toolCallId ?? null,
    timestamp,
  );

  return id;
}

export function listConversationMessages(conversationId: string) {
  const rows = db
    .prepare(
      "SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at ASC",
    )
    .all(conversationId) as DbRow[];
  return rows.map(mapConversationMessage);
}

export function getConversationDetailByIdForUser(userId: string, id: string) {
  const conversation = getConversationByIdForUser(userId, id);
  if (!conversation) {
    return null;
  }

  return {
    ...conversation,
    messages: listConversationMessages(id),
    toolCalls: listToolCallsByConversationId(id),
  };
}

export function createAgentToolCall(input: {
  conversationId: string;
  serverConfigId: string | null;
  toolSource: AgentToolSource;
  toolName: string;
  inputJson: string;
  status?: AgentToolCallStatus;
}) {
  const id = randomUUID();
  const timestamp = nowIso();
  db.prepare(
    `
      INSERT INTO agent_tool_calls (
        id, conversation_id, server_config_id, tool_source, tool_name,
        input_json, output_json, status, error_message, started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, NULL)
    `,
  ).run(
    id,
    input.conversationId,
    input.serverConfigId,
    input.toolSource,
    input.toolName,
    input.inputJson,
    input.status ?? "running",
    timestamp,
  );

  return id;
}

export function finishAgentToolCall(input: {
  id: string;
  status: AgentToolCallStatus;
  outputJson?: string | null;
  errorMessage?: string | null;
}) {
  db.prepare(
    `
      UPDATE agent_tool_calls
      SET status = ?, output_json = ?, error_message = ?, finished_at = ?
      WHERE id = ?
    `,
  ).run(
    input.status,
    input.outputJson ?? null,
    input.errorMessage ?? null,
    nowIso(),
    input.id,
  );
}

export function listToolCallsByConversationId(conversationId: string) {
  const rows = db
    .prepare(
      "SELECT * FROM agent_tool_calls WHERE conversation_id = ? ORDER BY started_at ASC",
    )
    .all(conversationId) as DbRow[];
  return rows.map(mapToolCall);
}

export function listConversationHistory(userId: string) {
  const conversations = listConversationsByUserId(userId);
  return conversations.map((conversation) => ({
    ...conversation,
    toolCalls: listToolCallsByConversationId(conversation.id),
  }));
}
