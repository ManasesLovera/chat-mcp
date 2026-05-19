"use client";

import { useState, useTransition } from "react";

type Config = {
  id: string;
  name: string;
  isEnabled: boolean;
  transportType: "stdio" | "http";
};

type ToolCall = {
  id: string;
  serverConfigId: string | null;
  toolSource: "mcp" | "web_search";
  toolName: string;
  inputJson: string;
  outputJson: string | null;
  status: string;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type AgentResult = {
  finalAnswer: string;
  toolCalls: ToolCall[];
  conversation: {
    id: string;
    status: string;
  };
};

export function AgentClient({
  configs,
  hasAIConnection,
}: {
  configs: Config[];
  hasAIConnection: boolean;
}) {
  const [prompt, setPrompt] = useState(
    "Use the available tools to inspect the configured MCP servers and explain what they can do.",
  );
  const [selectedConfigIds, setSelectedConfigIds] = useState(
    configs.filter((config) => config.isEnabled).map((config) => config.id),
  );
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleConfig(id: string) {
    setSelectedConfigIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  }

  async function runTest() {
    setError(null);
    setResult(null);

    startTransition(async () => {
      try {
        const response = await fetch("/agent/test", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt,
            selectedConfigIds,
            enableWebSearch,
          }),
        });
        const data = (await response.json()) as AgentResult & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Agent test failed.");
        }

        setResult(data);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Agent test failed.",
        );
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="panel rounded-[2rem] p-6">
        <p className="eyebrow">Agent Input</p>
        <h2 className="mt-2 text-xl font-semibold">Run a tool-using test</h2>
        <p className="muted mt-2 text-sm leading-6">
          The agent gets function-tool wrappers for the selected MCP server
          tools plus the app-owned <span className="mono">web_search</span>{" "}
          tool. Every tool call is persisted.
        </p>

        {!hasAIConnection && (
          <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Connect an OpenAI or Gemini credential on the dashboard before
            running the agent.
          </div>
        )}

        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-medium">Prompt</span>
          <textarea
            className="textarea"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>

        <div className="mt-5">
          <p className="text-sm font-medium">Enabled MCP configs</p>
          <div className="mt-3 space-y-3">
            {configs.length === 0 ? (
              <p className="text-sm muted">
                No enabled configs available. Create one on the dashboard first.
              </p>
            ) : (
              configs.map((config) => (
                <label
                  key={config.id}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white/70 px-4 py-3"
                >
                  <input
                    type="checkbox"
                    checked={selectedConfigIds.includes(config.id)}
                    onChange={() => toggleConfig(config.id)}
                  />
                  <span className="text-sm font-medium">{config.name}</span>
                  <span className="tag">{config.transportType}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <label className="mt-5 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white/70 px-4 py-3">
          <input
            type="checkbox"
            checked={enableWebSearch}
            onChange={(event) => setEnableWebSearch(event.target.checked)}
          />
          <span className="text-sm font-medium">Enable built-in web_search</span>
        </label>

        <button
          type="button"
          onClick={runTest}
          disabled={pending || !hasAIConnection || prompt.trim() === ""}
          className="btn-primary mt-5 w-full rounded-full px-5 py-3 font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Running agent..." : "Run test"}
        </button>

        {error && <p className="danger mt-4 text-sm">{error}</p>}
      </section>

      <section className="panel rounded-[2rem] p-6">
        <p className="eyebrow">Trace</p>
        <h2 className="mt-2 text-xl font-semibold">Conversation output</h2>

        {!result ? (
          <p className="muted mt-5 text-sm leading-6">
            Run a test to see the final answer and tool-call trace here.
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="rounded-3xl bg-[#142118] p-5 text-[#e9fff2]">
              <p className="mono text-xs uppercase tracking-[0.18em] text-[#8ce0b5]">
                Final answer
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                {result.finalAnswer}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Tool calls</p>
                <span className="tag">{result.toolCalls.length} calls</span>
              </div>
              <div className="mt-3 space-y-3">
                {result.toolCalls.length === 0 ? (
                  <p className="text-sm muted">No tools were used.</p>
                ) : (
                  result.toolCalls.map((toolCall) => (
                    <article
                      key={toolCall.id}
                      className="rounded-2xl border border-[var(--border)] bg-white/70 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="mono text-sm font-medium">
                          {toolCall.toolName}
                        </span>
                        <span className="tag">{toolCall.toolSource}</span>
                        <span className="tag">{toolCall.status}</span>
                      </div>
                      <pre className="mono mt-3 overflow-x-auto rounded-xl bg-[#142118] px-3 py-3 text-xs text-[#dff6eb]">
                        {toolCall.inputJson}
                      </pre>
                      {toolCall.outputJson && (
                        <pre className="mono mt-3 overflow-x-auto rounded-xl bg-white px-3 py-3 text-xs text-slate-800">
                          {toolCall.outputJson}
                        </pre>
                      )}
                      {toolCall.errorMessage && (
                        <p className="danger mt-3 text-sm">{toolCall.errorMessage}</p>
                      )}
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
