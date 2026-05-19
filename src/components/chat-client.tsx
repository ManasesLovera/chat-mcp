"use client";

import { useMemo, useState, useTransition } from "react";
import { LogoutButton } from "@/components/logout-button";
import { OpenAILoginButton } from "@/components/openai-login-button";
import { GeminiLoginButton } from "@/components/gemini-login-button";

type AuthContext = {
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
  } | null;
  isLoggedInToApp: boolean;
  hasOpenAIConnection: boolean;
  hasOpenAICredential: boolean;
  hasGeminiConnection: boolean;
  hasGeminiCredential: boolean;
  chatUnlocked: boolean;
  openaiConnectionMode: string;
  geminiConnectionMode: string;
  oauthSupport: string;
};

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

type ConversationSummary = {
  id: string;
  title: string;
  finalAnswer: string | null;
  status: string;
  createdAt: string;
  lastMessageAt: string;
};

type ConversationMessage = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId: string | null;
  createdAt: string;
};

type ToolCall = {
  id: string;
  toolSource: "mcp" | "web_search";
  toolName: string;
  inputJson: string;
  outputJson: string | null;
  status: string;
  errorMessage: string | null;
};

type ConversationDetail = ConversationSummary & {
  prompt: string;
  completedAt: string | null;
  messages: ConversationMessage[];
  toolCalls: ToolCall[];
};

type Props = {
  auth: AuthContext;
  initialConversations: ConversationSummary[];
  initialConversation: ConversationDetail | null;
  initialConfigs: Config[];
  initialToolsByConfigId: Record<string, ToolSnapshot[]>;
};

type SettingsTab = "general" | "openai" | "gemini" | "mcp";

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
    envText: "",
    workingDirectory: "",
    url: "",
    isEnabled: true,
  };
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatPreview(message: string | null) {
  if (!message) {
    return "No assistant reply yet";
  }

  return message.replace(/\s+/g, " ").trim().slice(0, 72) || "No assistant reply yet";
}

export function ChatClient({
  auth,
  initialConversations,
  initialConversation,
  initialConfigs,
  initialToolsByConfigId,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [authState, setAuthState] = useState(auth);
  const [conversations, setConversations] = useState(initialConversations);
  const [activeConversation, setActiveConversation] = useState(initialConversation);
  const [composer, setComposer] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [openAIApiKey, setOpenAIApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [configs, setConfigs] = useState(initialConfigs);
  const [toolsByConfigId, setToolsByConfigId] = useState(initialToolsByConfigId);
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [enableMcpTools, setEnableMcpTools] = useState(false);
  const [selectedConfigIds, setSelectedConfigIds] = useState(
    initialConfigs.filter((config) => config.isEnabled).map((config) => config.id),
  );
  const [form, setForm] = useState<FormState>(emptyForm());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedConfigs = useMemo(
    () => [...configs].sort((a, b) => a.name.localeCompare(b.name)),
    [configs],
  );

  const visibleMessages = useMemo(
    () =>
      (activeConversation?.messages ?? []).filter(
        (entry) => entry.role === "user" || entry.role === "assistant" || entry.role === "tool",
      ),
    [activeConversation],
  );

  async function fetchConversation(id: string) {
    const response = await fetch(`/conversations/${id}`);
    const data = (await response.json()) as {
      error?: string;
      conversation?: ConversationDetail;
    };
    if (!response.ok || !data.conversation) {
      throw new Error(data.error ?? "Failed to load conversation.");
    }

    setActiveConversation(data.conversation);
  }

  function syncConversationSummary(detail: ConversationDetail) {
    setConversations((current) => {
      const next = current.filter((entry) => entry.id !== detail.id);
      next.unshift({
        id: detail.id,
        title: detail.title,
        finalAnswer: detail.finalAnswer,
        status: detail.status,
        createdAt: detail.createdAt,
        lastMessageAt: detail.lastMessageAt,
      });
      return next;
    });
  }

  function openSettings(tab: SettingsTab) {
    setSettingsTab(tab);
    setSettingsOpen(true);
    setMessage(null);
    setError(null);
  }

  async function createConversation() {
    const response = await fetch("/conversations", {
      method: "POST",
    });
    const data = (await response.json()) as {
      error?: string;
      conversation?: ConversationDetail;
    };
    if (!response.ok || !data.conversation) {
      throw new Error(data.error ?? "Failed to create conversation.");
    }

    setActiveConversation(data.conversation);
    syncConversationSummary(data.conversation);
    return data.conversation;
  }

  function handleSelectConversation(id: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await fetchConversation(id);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to load conversation.",
        );
      }
    });
  }

  function handleNewChat() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await createConversation();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to create conversation.",
        );
      }
    });
  }

  function handleSendMessage() {
    if (composer.trim() === "") {
      return;
    }

    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const target = activeConversation ?? (await createConversation());
        const response = await fetch(`/conversations/${target.id}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: composer,
            selectedConfigIds,
            enableWebSearch,
            enableMcpTools,
          }),
        });
        const data = (await response.json()) as {
          error?: string;
          conversation?: ConversationDetail;
        };
        if (!response.ok || !data.conversation) {
          throw new Error(data.error ?? "Failed to send message.");
        }

        setComposer("");
        setActiveConversation(data.conversation);
        syncConversationSummary(data.conversation);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error ? caughtError.message : "Failed to send message.",
        );
      }
    });
  }

  function toggleConfigSelection(id: string) {
    setSelectedConfigIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  }

  function selectConfigForEdit(config: Config) {
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
  }

  async function saveCredential() {
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
        setAuthState((current) => ({
          ...current,
          hasOpenAIConnection: true,
          hasOpenAICredential: true,
          chatUnlocked: true,
        }));
        setMessage("OpenAI bearer credential stored.");
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to save OpenAI credential.",
        );
      }
    });
  }

  async function removeCredential() {
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

        setAuthState((current) => ({
          ...current,
          hasOpenAIConnection: false,
          hasOpenAICredential: false,
          chatUnlocked: current.hasGeminiCredential,
        }));
        setMessage("OpenAI bearer credential removed.");
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to remove OpenAI credential.",
        );
      }
    });
  }

  async function saveGeminiCredential() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/auth/gemini/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ apiKey: geminiApiKey }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to save Gemini credential.");
        }

        setGeminiApiKey("");
        setAuthState((current) => ({
          ...current,
          hasGeminiConnection: true,
          hasGeminiCredential: true,
          chatUnlocked: true,
        }));
        setMessage("Gemini API key stored.");
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to save Gemini credential.",
        );
      }
    });
  }

  async function removeGeminiCredential() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/auth/gemini/session", {
          method: "DELETE",
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to remove Gemini credential.");
        }

        setAuthState((current) => ({
          ...current,
          hasGeminiConnection: false,
          hasGeminiCredential: false,
          chatUnlocked: current.hasOpenAICredential,
        }));
        setMessage("Gemini API key removed.");
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to remove Gemini credential.",
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
        const data = (await response.json()) as {
          error?: string;
          config?: Config;
        };
        if (!response.ok || !data.config) {
          throw new Error(data.error ?? "Failed to save MCP config.");
        }

        setConfigs((current) => {
          const next = current.filter((entry) => entry.id !== data.config!.id);
          return [data.config!, ...next];
        });
        if (data.config.isEnabled) {
          setSelectedConfigIds((current) =>
            current.includes(data.config!.id) ? current : [...current, data.config!.id],
          );
        }
        setForm(emptyForm());
        setMessage(form.id ? "MCP config updated." : "MCP config created.");
      } catch (caughtError) {
        setError(
          caughtError instanceof Error ? caughtError.message : "Failed to save MCP config.",
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

        setConfigs((current) => current.filter((entry) => entry.id !== id));
        setSelectedConfigIds((current) => current.filter((entry) => entry !== id));
        setToolsByConfigId((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        if (form.id === id) {
          setForm(emptyForm());
        }
        setMessage("MCP config deleted.");
      } catch (caughtError) {
        setError(
          caughtError instanceof Error ? caughtError.message : "Failed to delete MCP config.",
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
        const data = (await response.json()) as {
          error?: string;
          tools?: ToolSnapshot[];
        };
        if (!response.ok || !data.tools) {
          throw new Error(data.error ?? "Failed to discover tools.");
        }

        setToolsByConfigId((current) => ({
          ...current,
          [id]: data.tools!,
        }));
        setMessage("Tool snapshot refreshed.");
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to discover tools.",
        );
      }
    });
  }

  return (
    <div className="chat-app min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="chat-sidebar hidden lg:flex">
          <div className="flex items-center justify-between px-3 py-2">
            <button
              type="button"
              onClick={handleNewChat}
              className="chat-sidebar-button flex-1"
            >
              New chat
            </button>
            <button
              type="button"
              onClick={() => openSettings("general")}
              className="chat-icon-button ml-2"
            >
              ⚙
            </button>
          </div>

          <div className="mt-3 flex-1 overflow-y-auto px-2">
            {conversations.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-[#212121] px-4 py-3 text-sm text-[#8f8f8f]">
                No chats yet.
              </div>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => handleSelectConversation(conversation.id)}
                  className={`chat-thread-item ${
                    activeConversation?.id === conversation.id ? "chat-thread-item-active" : ""
                  }`}
                >
                  <span className="block truncate text-sm font-medium text-[#ececec]">
                    {conversation.title}
                  </span>
                  <span className="mt-1 block truncate text-xs text-[#8f8f8f]">
                    {formatPreview(conversation.finalAnswer)}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="border-t border-white/8 p-3">
            <div className="mb-3 text-xs text-[#8f8f8f]">
              {authState.user?.displayName ?? authState.user?.email ?? "Local user"}
            </div>
            <LogoutButton />
          </div>
        </aside>

        <main className="flex min-h-screen flex-1 flex-col bg-[#212121]">
          <header className="flex items-center justify-between px-4 py-3 lg:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleNewChat}
                className="chat-icon-button lg:hidden"
              >
                ＋
              </button>
              <div>
                <p className="text-sm font-medium text-white">
                  {activeConversation?.title ?? "New chat"}
                </p>
                <p className="text-xs text-[#8f8f8f]">
                  {authState.chatUnlocked
                    ? "Chat enabled"
                    : authState.isLoggedInToApp
                      ? "Connect OpenAI or Gemini to start chatting"
                      : "Sign in to start chatting"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!authState.isLoggedInToApp ? (
                <div className="flex gap-2">
                  <OpenAILoginButton className="chat-secondary-button rounded-full px-4 py-2 text-sm">
                    OpenAI
                  </OpenAILoginButton>
                  <GeminiLoginButton className="chat-secondary-button rounded-full px-4 py-2 text-sm">
                    Gemini
                  </GeminiLoginButton>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => openSettings(authState.hasGeminiCredential ? "gemini" : "openai")}
                    className="chat-secondary-button rounded-full px-4 py-2 text-sm"
                  >
                    {authState.hasOpenAICredential
                      ? "OpenAI connected"
                      : authState.hasGeminiCredential
                        ? "Gemini connected"
                        : "Connect AI"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openSettings("general")}
                    className="chat-icon-button"
                  >
                    ⚙
                  </button>
                </>
              )}
            </div>
          </header>

          <section className="flex-1 overflow-y-auto px-4 pb-6 pt-2 lg:px-8">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
              {!activeConversation ? (
                <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                  <h1 className="text-3xl font-semibold tracking-tight text-white">
                    What can I help with?
                  </h1>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-[#8f8f8f]">
                    Start a new chat. MCP tools are optional and configurable
                    from settings.
                  </p>
                </div>
              ) : (
                <div className="space-y-6 py-6">
                  {visibleMessages.map((messageItem) => (
                    <div
                      key={messageItem.id}
                      className={
                        messageItem.role === "user"
                          ? "flex justify-end"
                          : messageItem.role === "tool"
                            ? "flex justify-center"
                            : "flex justify-start"
                      }
                    >
                      <div
                        className={
                          messageItem.role === "user"
                            ? "chat-user-bubble"
                            : messageItem.role === "tool"
                              ? "chat-tool-bubble"
                              : "chat-assistant-block"
                        }
                      >
                        {messageItem.role === "tool" && (
                          <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[#8f8f8f]">
                            Tool trace
                          </div>
                        )}
                        <div className="whitespace-pre-wrap text-sm leading-7">
                          {messageItem.content}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <footer className="px-4 pb-6 lg:px-8">
            <div className="mx-auto w-full max-w-3xl">
              {(message || error) && (
                <p className={`mb-3 text-sm ${error ? "text-[#f87171]" : "text-[#8bd4a5]"}`}>
                  {error ?? message}
                </p>
              )}

              {!authState.isLoggedInToApp && (
                <div className="mb-4 rounded-3xl border border-white/8 bg-[#171717] px-5 py-4 text-sm text-[#9f9f9f]">
                  Log in first to create a local chat session.
                </div>
              )}

              {authState.isLoggedInToApp && !authState.chatUnlocked && (
                <div className="mb-4 rounded-3xl border border-white/8 bg-[#171717] px-5 py-4 text-sm text-[#9f9f9f]">
                  Chat is locked until you connect an encrypted OpenAI or Gemini
                  credential in settings.
                  <button
                    type="button"
                    onClick={() => openSettings("openai")}
                    className="ml-3 text-[#ececec] underline"
                  >
                    Open settings
                  </button>
                </div>
              )}

              <div className="chat-composer-shell">
                <textarea
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (authState.chatUnlocked && !pending && composer.trim() !== "") {
                        handleSendMessage();
                      }
                    }
                  }}
                  placeholder={
                    authState.chatUnlocked
                      ? "Message this local chat app"
                      : "Connect AI to start chatting"
                  }
                  disabled={!authState.chatUnlocked || pending}
                  className="chat-composer"
                />
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#8f8f8f]">
                    <span className="chat-chip">{enableWebSearch ? "Web search on" : "Web search off"}</span>
                    <span className="chat-chip">{enableMcpTools ? "MCP enabled" : "MCP disabled"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!authState.chatUnlocked || pending || composer.trim() === ""}
                    className="chat-send-button"
                  >
                    {pending ? "Thinking..." : "Send"}
                  </button>
                </div>
              </div>
            </div>
          </footer>
        </main>
      </div>

      {settingsOpen && (
        <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
          <section
            className="settings-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
              <div>
                <p className="text-sm font-medium text-white">Settings</p>
                <p className="text-xs text-[#8f8f8f]">
                  Chat-first shell with optional MCP tools
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="chat-icon-button"
              >
                ✕
              </button>
            </div>

            <div className="flex min-h-0 flex-1">
              <nav className="settings-nav">
                {(["general", "openai", "gemini", "mcp"] as SettingsTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSettingsTab(tab)}
                    className={`settings-nav-button ${
                      settingsTab === tab ? "settings-nav-button-active" : ""
                    }`}
                  >
                    {tab === "general"
                      ? "General"
                      : tab === "openai"
                        ? "OpenAI"
                        : tab === "gemini"
                          ? "Gemini"
                          : "MCP"}
                  </button>
                ))}
              </nav>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {settingsTab === "general" && (
                  <div className="space-y-5">
                    <section className="settings-card">
                      <h3 className="text-base font-semibold text-white">Chat shell</h3>
                      <p className="mt-2 text-sm leading-7 text-[#9f9f9f]">
                        The root experience is chat-first. MCP is optional and
                        only augments tool availability when enabled.
                      </p>
                    </section>
                    <section className="settings-card">
                      <h3 className="text-base font-semibold text-white">Tool toggles</h3>
                      <label className="settings-toggle">
                        <input
                          type="checkbox"
                          checked={enableWebSearch}
                          onChange={(event) => setEnableWebSearch(event.target.checked)}
                        />
                        <span>Enable built-in web_search</span>
                      </label>
                      <label className="settings-toggle">
                        <input
                          type="checkbox"
                          checked={enableMcpTools}
                          onChange={(event) => setEnableMcpTools(event.target.checked)}
                        />
                        <span>Allow MCP tools in chat</span>
                      </label>
                    </section>
                  </div>
                )}

                {settingsTab === "openai" && (
                  <div className="space-y-5">
                    <section className="settings-card">
                      <h3 className="text-base font-semibold text-white">
                        Browser-prompt fallback
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-[#9f9f9f]">
                        Current public OpenAI docs document bearer-token API
                        authentication but do not document a supported
                        third-party local-app identity OAuth flow equivalent to
                        ChatGPT sign-in. This app therefore uses a browser-prompt
                        local session plus encrypted bearer credential storage.
                      </p>
                      {!authState.isLoggedInToApp && (
                        <div className="mt-4">
                          <OpenAILoginButton className="chat-primary-button rounded-full px-5 py-3 text-sm font-semibold" />
                        </div>
                      )}
                    </section>
                    <section className="settings-card">
                      <h3 className="text-base font-semibold text-white">
                        Connect bearer credential
                      </h3>
                      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                        <input
                          type="password"
                          value={openAIApiKey}
                          onChange={(event) => setOpenAIApiKey(event.target.value)}
                          placeholder="Paste OpenAI API key or Bearer token"
                          className="settings-input"
                        />
                        <button
                          type="button"
                          onClick={saveCredential}
                          disabled={pending || openAIApiKey.trim() === ""}
                          className="chat-primary-button rounded-full px-5 py-3 text-sm font-semibold disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={removeCredential}
                          disabled={pending || !authState.hasOpenAICredential}
                          className="chat-secondary-button rounded-full px-5 py-3 text-sm disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </section>
                  </div>
                )}

                {settingsTab === "gemini" && (
                  <div className="space-y-5">
                    <section className="settings-card">
                      <h3 className="text-base font-semibold text-white">
                        Google Gemini API
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-[#9f9f9f]">
                        Google exposes Gemini API via Google AI Studio. While
                        full OAuth flows exist for Google Cloud, this lab
                        focuses on local agent testing with encrypted API key
                        storage.
                      </p>
                      {!authState.isLoggedInToApp && (
                        <div className="mt-4">
                          <GeminiLoginButton className="chat-primary-button rounded-full px-5 py-3 text-sm font-semibold" />
                        </div>
                      )}
                    </section>
                    <section className="settings-card">
                      <h3 className="text-base font-semibold text-white">
                        Connect API key
                      </h3>
                      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                        <input
                          type="password"
                          value={geminiApiKey}
                          onChange={(event) => setGeminiApiKey(event.target.value)}
                          placeholder="Paste Gemini API key"
                          className="settings-input"
                        />
                        <button
                          type="button"
                          onClick={saveGeminiCredential}
                          disabled={pending || geminiApiKey.trim() === ""}
                          className="chat-primary-button rounded-full px-5 py-3 text-sm font-semibold disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={removeGeminiCredential}
                          disabled={pending || !authState.hasGeminiCredential}
                          className="chat-secondary-button rounded-full px-5 py-3 text-sm disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </section>
                  </div>
                )}

                {settingsTab === "mcp" && (
                  <div className="space-y-5">
                    <section className="settings-card">
                      <h3 className="text-base font-semibold text-white">Active MCP tools</h3>
                      <p className="mt-2 text-sm leading-7 text-[#9f9f9f]">
                        Chat works without MCP. Enable only the configs you want
                        available to the model.
                      </p>
                      <div className="mt-4 space-y-3">
                        {sortedConfigs.length === 0 ? (
                          <p className="text-sm text-[#8f8f8f]">
                            No MCP configs saved yet.
                          </p>
                        ) : (
                          sortedConfigs.map((config) => (
                            <div key={config.id} className="settings-config-row">
                              <input
                                type="checkbox"
                                checked={selectedConfigIds.includes(config.id)}
                                onChange={() => toggleConfigSelection(config.id)}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-white">
                                    {config.name}
                                  </span>
                                  <span className="chat-chip">{config.transportType}</span>
                                  <span className="chat-chip">
                                    {config.isEnabled ? "enabled" : "disabled"}
                                  </span>
                                </div>
                                {(toolsByConfigId[config.id] ?? []).length > 0 && (
                                  <p className="mt-1 text-xs text-[#8f8f8f]">
                                    {(toolsByConfigId[config.id] ?? []).length} discovered tools
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => selectConfigForEdit(config)}
                                className="chat-secondary-button rounded-full px-3 py-2 text-xs"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => discoverTools(config.id)}
                                className="chat-secondary-button rounded-full px-3 py-2 text-xs"
                              >
                                Discover
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteConfig(config.id)}
                                className="rounded-full border border-red-500/30 px-3 py-2 text-xs text-red-300"
                              >
                                Delete
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </section>

                    <section className="settings-card">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-semibold text-white">
                          {form.id ? "Edit MCP config" : "Add MCP config"}
                        </h3>
                        {form.id && (
                          <button
                            type="button"
                            onClick={() => setForm(emptyForm())}
                            className="chat-secondary-button rounded-full px-3 py-2 text-xs"
                          >
                            New
                          </button>
                        )}
                      </div>
                      <div className="mt-4 space-y-4">
                        <input
                          className="settings-input"
                          value={form.name}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, name: event.target.value }))
                          }
                          placeholder="Name"
                        />
                        <select
                          className="settings-input"
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
                        <input
                          className="settings-input"
                          value={form.command}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, command: event.target.value }))
                          }
                          placeholder="Command"
                        />
                        <textarea
                          className="settings-textarea"
                          value={form.argsText}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, argsText: event.target.value }))
                          }
                          placeholder='Args JSON, e.g. ["server.js"]'
                        />
                        <textarea
                          className="settings-textarea"
                          value={form.envText}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, envText: event.target.value }))
                          }
                          placeholder='Env JSON, e.g. {"API_KEY":"..."}'
                        />
                        <input
                          className="settings-input"
                          value={form.workingDirectory}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              workingDirectory: event.target.value,
                            }))
                          }
                          placeholder="Working directory"
                        />
                        <input
                          className="settings-input"
                          value={form.url}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, url: event.target.value }))
                          }
                          placeholder="HTTP URL"
                        />
                        <label className="settings-toggle">
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
                          <span>Enabled for chat tool use</span>
                        </label>
                        <button
                          type="button"
                          onClick={saveConfig}
                          disabled={pending}
                          className="chat-primary-button rounded-full px-5 py-3 text-sm font-semibold disabled:opacity-50"
                        >
                          {form.id ? "Update config" : "Create config"}
                        </button>
                      </div>
                    </section>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
