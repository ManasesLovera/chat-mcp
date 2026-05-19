# Local Chat + Optional MCP

Local ChatGPT-like web app for chatting with an OpenAI-backed model and optionally exposing tools from local MCP servers.

This app:

- is chat-first, with `/` as the main conversation surface
- keeps MCP optional and settings-driven
- stores its own MCP configuration in SQLite
- persists conversations, messages, and tool calls
- supports local stdio MCP servers first
- includes a built-in `web_search` tool
- does **not** read `~/.codex/config.toml`
- does **not** read `.codex/config.toml`
- does **not** depend on Codex MCP configuration

## Current auth behavior

The UI starts with an OpenAI-branded browser prompt and popup flow for the local app session.

As of May 18, 2026, current public OpenAI docs describe bearer-token API authentication, ChatGPT-side OAuth for remote MCP/connectors, and application-managed OAuth for MCP integrations, but they do not document a supported third-party local-app identity OAuth flow equivalent to ChatGPT sign-in for this app.

This app therefore ships the closest supported fallback:

- `GET /auth/openai/login` opens a browser popup prompt
- `GET /auth/openai/callback` completes the local app session and closes the popup
- the user then connects an encrypted OpenAI bearer credential in settings
- chat unlocks after the bearer credential is connected

Relevant docs:

- https://platform.openai.com/docs/api-reference/authentication?api-mode=responses
- https://platform.openai.com/docs/guides/developer-mode
- https://platform.openai.com/docs/guides/tools-remote-mcp
- https://platform.openai.com/docs/actions/authentication/oauth

## Stack

- Next.js 16 App Router
- route handlers for backend endpoints
- SQLite via `better-sqlite3`
- AES-GCM encryption for stored bearer credentials and MCP env payloads
- stdio MCP client implemented with JSON-RPC over spawned child processes

## Environment

Optional environment variables:

```bash
APP_DATABASE_PATH=./data/local-mcp-agent-lab.sqlite
APP_ENCRYPTION_SECRET=replace-this-for-real-use
OPENAI_MODEL=gpt-4.1
OPENAI_API_KEY=optional-global-fallback-key
MCP_STARTUP_TIMEOUT_MS=8000
MCP_TOOL_TIMEOUT_MS=20000
AGENT_MAX_TOOL_ROUNDS=8
```

Notes:

- Set `APP_ENCRYPTION_SECRET` in any non-throwaway environment.
- `OPENAI_API_KEY` is only a server-side fallback. The intended UX is connecting a per-user bearer credential in settings after the popup login flow.

## Run locally

```bash
bun dev
```

Open `http://localhost:3000`.

If TypeScript complains about stale Next route types after route changes:

```bash
bunx next typegen
```

## Main pages

- `/` chat-first app shell
- `/login` redirects to `/`
- `/dashboard` redirects to `/`
- `/agent` redirects to `/`
- `/history` redirects to `/`

## Main backend endpoints

Auth:

- `GET /auth/openai/login`
- `GET /auth/openai/callback`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/openai/session`
- `DELETE /auth/openai/session`

Chat:

- `GET /conversations`
- `POST /conversations`
- `GET /conversations/:id`
- `POST /conversations/:id/messages`

MCP:

- `GET /mcp/configs`
- `POST /mcp/configs`
- `PUT /mcp/configs/:id`
- `DELETE /mcp/configs/:id`
- `POST /mcp/configs/:id/discover-tools`
- `POST /mcp/configs/:id/call-tool`

Legacy testing endpoint kept for compatibility:

- `POST /agent/test`

## Data model

SQLite tables:

- `users`
- `openai_sessions`
- `mcp_server_configs`
- `mcp_tool_snapshots`
- `agent_conversations`
- `conversation_messages`
- `agent_tool_calls`

## MCP notes

- stdio transport is implemented
- HTTP transport is schema-supported but not executed yet
- shell strings are never executed
- executable + args array only
- working directories must already exist

## Web search

The built-in `web_search` tool uses a DuckDuckGo-based provider abstraction as the default low-friction search backend.
