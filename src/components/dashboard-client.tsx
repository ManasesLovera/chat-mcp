"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ToolSnapshot = {
  id: string;
  toolName: string;
  description: string | null;
  inputSchema: unknown;
  discoveredAt: string;
};

type Config = {
  id: string;
  name: string;
  transportType: "stdio" | "http";
  command: string | null;
  args: string[];
  env: Record<string, string>;
  workingDirectory: string | null;
  url: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  configs: Config[];
  toolsByConfigId: Record<string, ToolSnapshot[]>;
  hasOpenAIConnection: boolean;
};

type FormState = {
  id: string | null;
  name: string;
  transportType: "stdio" | "http";
  command: string;
  argsText: string;
  envText: string;
  workingDirectory: string;
  url: string;
  isEnabled: boolean;
};

function emptyForm(): FormState {
  return {
    id: null,
    name: "",
    transportType: "stdio",
    command: "",
    argsText: "[]",
    envText: "{}",
    workingDirectory: "",
    url: "",
    isEnabled: true,
  };
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function DashboardClient({
  configs,
  toolsByConfigId,
  hasOpenAIConnection,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openAIApiKey, setOpenAIApiKey] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm());

  const sortedConfigs = useMemo(
    () => [...configs].sort((a, b) => a.name.localeCompare(b.name)),
    [configs],
  );

  function selectConfig(config: Config) {
    setForm({
      id: config.id,
      name: config.name,
      transportType: config.transportType,
      command: config.command ?? "",
      argsText: formatJson(config.args),
      envText: "",
      workingDirectory: config.workingDirectory ?? "",
      url: config.url ?? "",
      isEnabled: config.isEnabled,
    });
    setMessage(null);
    setError(null);
  }

  function resetForm() {
    setForm(emptyForm());
  }

  async function saveOpenAIKey() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/auth/openai/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ apiKey: openAIApiKey }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to save OpenAI credential.");
        }

        setOpenAIApiKey("");
        setMessage("OpenAI credential stored in the app database.");
        router.refresh();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to save OpenAI credential.",
        );
      }
    });
  }

  async function disconnectOpenAIKey() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/auth/openai/session", {
          method: "DELETE",
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to remove OpenAI credential.");
        }

        setMessage("OpenAI credential removed.");
        router.refresh();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to remove OpenAI credential.",
        );
      }
    });
  }

  async function saveConfig() {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(
          form.id ? `/mcp/configs/${form.id}` : "/mcp/configs",
          {
            method: form.id ? "PUT" : "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: form.name,
              transportType: form.transportType,
              command: form.command || null,
              args: JSON.parse(form.argsText || "[]"),
              ...(form.envText.trim() !== ""
                ? { env: JSON.parse(form.envText) }
                : {}),
              workingDirectory: form.workingDirectory || null,
              url: form.url || null,
              isEnabled: form.isEnabled,
            }),
          },
        );
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to save MCP config.");
        }

        setMessage(form.id ? "Config updated." : "Config created.");
        resetForm();
        router.refresh();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to save MCP config.",
        );
      }
    });
  }

  async function deleteConfig(id: string) {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/mcp/configs/${id}`, {
          method: "DELETE",
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to delete MCP config.");
        }

        if (form.id === id) {
          resetForm();
        }

        setMessage("Config deleted.");
        router.refresh();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to delete MCP config.",
        );
      }
    });
  }

  async function discoverTools(id: string) {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/mcp/configs/${id}/discover-tools`, {
          method: "POST",
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Tool discovery failed.");
        }

        setMessage("Tool snapshot refreshed.");
        router.refresh();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Tool discovery failed.",
        );
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-6">
        <section className="panel rounded-[2rem] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="eyebrow">OpenAI Connection</p>
              <h2 className="mt-2 text-xl font-semibold">
                Closest supported auth fallback
              </h2>
              <p className="muted mt-2 max-w-3xl text-sm leading-6">
                Public OpenAI docs do not currently expose a third-party local
                app browser OAuth identity flow comparable to ChatGPT or Codex
                sign-in. This app keeps the OpenAI-branded login UX, then stores
                an encrypted API credential locally for model calls without
                reading any Codex config.
              </p>
            </div>
            <div className="tag">
              {hasOpenAIConnection ? "Connected" : "Not connected"}
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <input
              type="password"
              value={openAIApiKey}
              onChange={(event) => setOpenAIApiKey(event.target.value)}
              placeholder="Paste an OpenAI API key or bearer token"
              className="input"
            />
            <button
              type="button"
              onClick={saveOpenAIKey}
              disabled={pending || openAIApiKey.trim() === ""}
              className="btn-primary rounded-full px-5 py-3 font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save credential
            </button>
            <button
              type="button"
              onClick={disconnectOpenAIKey}
              disabled={pending || !hasOpenAIConnection}
              className="btn-secondary rounded-full border border-[var(--border)] px-5 py-3 font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              Remove
            </button>
          </div>

          {(message || error) && (
            <p className={`mt-4 text-sm ${error ? "danger" : "text-[var(--accent-strong)]"}`}>
              {error ?? message}
            </p>
          )}
        </section>

        <section className="panel rounded-[2rem] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">MCP Configs</p>
              <h2 className="mt-2 text-xl font-semibold">Configured servers</h2>
            </div>
            <span className="tag">{configs.length} total</span>
          </div>

          <div className="table-grid mt-6">
            {sortedConfigs.length === 0 ? (
              <div className="py-8 text-sm muted">
                No MCP configs saved yet. Add a local stdio server on the right,
                then discover its tools.
              </div>
            ) : (
              sortedConfigs.map((config) => (
                <article
                  key={config.id}
                  className="grid gap-4 py-5 lg:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{config.name}</h3>
                      <span className="tag">{config.transportType}</span>
                      <span className="tag">{config.isEnabled ? "enabled" : "disabled"}</span>
                    </div>
                    <div className="mt-3 space-y-2 text-sm muted">
                      {config.command && (
                        <p>
                          <span className="mono">command</span>: {config.command}
                        </p>
                      )}
                      {config.args.length > 0 && (
                        <p>
                          <span className="mono">args</span>: {JSON.stringify(config.args)}
                        </p>
                      )}
                      {Object.keys(config.env).length > 0 && (
                        <p>
                          <span className="mono">env keys</span>:{" "}
                          {Object.keys(config.env).join(", ")}
                        </p>
                      )}
                      {config.workingDirectory && (
                        <p>
                          <span className="mono">cwd</span>: {config.workingDirectory}
                        </p>
                      )}
                      {config.url && (
                        <p>
                          <span className="mono">url</span>: {config.url}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">Discovered tools</p>
                        <span className="mono text-xs muted">
                          {(toolsByConfigId[config.id] ?? []).length} tools
                        </span>
                      </div>
                      <div className="mt-3 space-y-3">
                        {(toolsByConfigId[config.id] ?? []).length === 0 ? (
                          <p className="text-sm muted">
                            No snapshot yet. Run discovery after the server is
                            configured.
                          </p>
                        ) : (
                          (toolsByConfigId[config.id] ?? []).map((tool) => (
                            <div
                              key={tool.id}
                              className="rounded-2xl border border-[var(--border)] bg-white/70 p-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="mono text-sm font-medium">
                                  {tool.toolName}
                                </span>
                                <span className="mono text-xs muted">
                                  {new Date(tool.discoveredAt).toLocaleString()}
                                </span>
                              </div>
                              {tool.description && (
                                <p className="mt-2 text-sm muted">{tool.description}</p>
                              )}
                              <pre className="mono mt-3 overflow-x-auto rounded-xl bg-[#142118] px-3 py-3 text-xs text-[#dff6eb]">
                                {formatJson(tool.inputSchema)}
                              </pre>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:flex-col">
                    <button
                      type="button"
                      onClick={() => selectConfig(config)}
                      className="btn-secondary rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium transition"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => discoverTools(config.id)}
                      disabled={pending}
                      className="btn-primary rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Discover tools
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteConfig(config.id)}
                      disabled={pending}
                      className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <aside className="panel rounded-[2rem] p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow">Editor</p>
            <h2 className="mt-2 text-xl font-semibold">
              {form.id ? "Edit MCP config" : "Add MCP config"}
            </h2>
          </div>
          {form.id && (
            <button
              type="button"
              onClick={resetForm}
              className="btn-secondary rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium transition"
            >
              New config
            </button>
          )}
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Name</span>
            <input
              className="input"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Transport</span>
            <select
              className="select"
              value={form.transportType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  transportType: event.target.value as "stdio" | "http",
                }))
              }
            >
              <option value="stdio">stdio</option>
              <option value="http">http</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Command</span>
            <input
              className="input"
              value={form.command}
              onChange={(event) =>
                setForm((current) => ({ ...current, command: event.target.value }))
              }
              placeholder="npx"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Args JSON</span>
            <textarea
              className="textarea mono"
              value={form.argsText}
              onChange={(event) =>
                setForm((current) => ({ ...current, argsText: event.target.value }))
              }
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Env JSON</span>
            <textarea
              className="textarea mono"
              value={form.envText}
              onChange={(event) =>
                setForm((current) => ({ ...current, envText: event.target.value }))
              }
            />
            <p className="muted mt-2 text-xs leading-5">
              Existing env secrets stay in place if this field is left blank
              during edits. API responses never return the underlying values.
            </p>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Working directory</span>
            <input
              className="input"
              value={form.workingDirectory}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  workingDirectory: event.target.value,
                }))
              }
              placeholder="/absolute/path/to/server"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">HTTP URL</span>
            <input
              className="input"
              value={form.url}
              onChange={(event) =>
                setForm((current) => ({ ...current, url: event.target.value }))
              }
              placeholder="https://example.com/mcp"
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white/70 px-4 py-3">
            <input
              type="checkbox"
              checked={form.isEnabled}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  isEnabled: event.target.checked,
                }))
              }
            />
            <span className="text-sm font-medium">Enabled for agent runs</span>
          </label>

          <button
            type="button"
            onClick={saveConfig}
            disabled={pending}
            className="btn-primary w-full rounded-full px-5 py-3 font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving..." : form.id ? "Update config" : "Create config"}
          </button>
        </div>
      </aside>
    </div>
  );
}
