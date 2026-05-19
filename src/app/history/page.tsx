import { AppShell } from "@/components/app-shell";
import { requireCurrentUser } from "@/server/auth";
import { listConversationHistory } from "@/server/db";

export default async function HistoryPage() {
  const user = await requireCurrentUser();
  const history = listConversationHistory(user.id);

  return (
    <AppShell user={user} currentPath="/history">
      <section className="panel rounded-[2rem] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Conversation History</p>
            <h2 className="mt-2 text-xl font-semibold">Previous agent runs</h2>
          </div>
          <span className="tag">{history.length} saved runs</span>
        </div>

        <div className="table-grid mt-6">
          {history.length === 0 ? (
            <div className="py-8 text-sm muted">
              No agent conversations have been saved yet.
            </div>
          ) : (
            history.map((conversation) => (
              <article key={conversation.id} className="py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{conversation.title}</h3>
                  <span className="tag">{conversation.status}</span>
                  <span className="mono text-xs muted">
                    {new Date(conversation.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-3 text-sm">
                  <span className="font-medium">Prompt:</span> {conversation.prompt}
                </p>
                <div className="mt-4 rounded-2xl bg-[#142118] p-4 text-sm text-[#ebfff3]">
                  <p className="mono text-xs uppercase tracking-[0.16em] text-[#8ce0b5]">
                    Final answer
                  </p>
                  <p className="mt-2 whitespace-pre-wrap leading-7">
                    {conversation.finalAnswer ?? "No final answer stored."}
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  {conversation.toolCalls.length === 0 ? (
                    <p className="text-sm muted">No tool calls recorded.</p>
                  ) : (
                    conversation.toolCalls.map((toolCall) => (
                      <div
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
                      </div>
                    ))
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
