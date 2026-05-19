# Local MCP Agent Lab

Local web app for testing local MCP servers with an LLM agent.

This app:

- stores its own MCP config in SQLite
- supports local stdio MCP servers first
- exposes discovered MCP tools plus a built-in `web_search` tool to an agent
- persists conversations and tool-call traces
- does **not** read `~/.codex/config.toml`
- does **not** read `.codex/config.toml`
- does **not** depend on Codex MCP configuration

## OpenAI auth limitation

The requested product shape included browser OAuth login with OpenAI similar to the Codex sign-in flow.

As of May 18, 2026, public OpenAI docs describe API authentication with API keys and do not document a supported third-party local-app identity OAuth flow equivalent to ChatGPT or Codex sign-in.

This app therefore implements the closest supported fallback:

- the login UX still begins at `GET /auth/openai/login`
- the app creates its own local browser session
- actual model calls use an encrypted OpenAI API credential stored in the app database
- the dashboard clearly explains this limitation

References:

- https://developers.openai.com/api/reference/overview#authentication
- https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- https://platform.openai.com/docs/actions/authentication/oauth

## Stack

- Next.js 16 App Router
- route handlers for backend endpoints
- SQLite via Node `node:sqlite`
- AES-GCM encryption for stored OpenAI credential and MCP env payloads
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

- `APP_ENCRYPTION_SECRET` should be set for any non-throwaway environment.
- `OPENAI_API_KEY` is optional. The primary supported path in the app is saving a per-user encrypted credential from the dashboard after login.

## Run locally

```bash
bun dev
```

Open `http://localhost:3000`.

## Main routes

Pages:

- `/login`
- `/dashboard`
- `/agent`
- `/history`

Backend endpoints:

- `GET /auth/openai/login`
- `GET /auth/openai/callback`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/openai/session`
- `DELETE /auth/openai/session`
- `GET /mcp/configs`
- `POST /mcp/configs`
- `PUT /mcp/configs/:id`
- `DELETE /mcp/configs/:id`
- `POST /mcp/configs/:id/discover-tools`
- `POST /mcp/configs/:id/call-tool`
- `POST /agent/test`

## MCP config notes

- stdio transport is implemented
- HTTP transport is schema-supported but intentionally not executed yet
- shell strings are never executed
- commands run as executable plus args array only
- working directories must already exist

## Data model

SQLite tables:

- `users`
- `openai_sessions`
- `mcp_server_configs`
- `mcp_tool_snapshots`
- `agent_conversations`
- `agent_tool_calls`

## Web search

The built-in `web_search` tool uses a DuckDuckGo-based provider abstraction intended as a low-friction default. It can be swapped later without changing the agent contract.
