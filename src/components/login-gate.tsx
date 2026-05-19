import { OpenAILoginButton } from "@/components/openai-login-button";

export function LoginGate() {
  return (
    <div className="chat-app min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
        <aside className="hidden w-[260px] flex-col border-r border-white/8 bg-[#171717] p-3 lg:flex">
          <div className="rounded-2xl border border-white/8 bg-[#212121] px-4 py-3 text-sm text-[#e8e8e8]">
            ChatGPT
          </div>
          <div className="mt-4 rounded-2xl bg-[#212121] p-4 text-sm text-[#9f9f9f]">
            Sign in to start a new conversation.
          </div>
        </aside>

        <main className="flex flex-1 items-center justify-center px-4 py-8">
          <section className="w-full max-w-[720px] text-center">
            <p className="text-[13px] font-medium uppercase tracking-[0.24em] text-[#8f8f8f]">
              Chat-first local app
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Talk first. Configure MCP only if you need tools.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[#b4b4b4]">
              This app keeps its own SQLite-backed MCP configuration, uses
              browser-prompt login flow for the local app session, and unlocks
              chat after you connect an encrypted OpenAI bearer credential in
              settings.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <span className="chat-chip">ChatGPT-like shell</span>
              <span className="chat-chip">MCP optional</span>
              <span className="chat-chip">SQLite configs</span>
              <span className="chat-chip">Bearer token encrypted</span>
            </div>
            <div className="mt-10">
              <OpenAILoginButton className="chat-primary-button mx-auto inline-flex min-w-[240px] items-center justify-center rounded-full px-6 py-3 text-sm font-semibold">
                Continue with OpenAI
              </OpenAILoginButton>
            </div>
            <p className="mx-auto mt-6 max-w-xl text-sm leading-7 text-[#8f8f8f]">
              The popup is a browser-prompt fallback because current public
              OpenAI docs describe bearer-token API auth but do not document a
              supported third-party local-app identity OAuth flow equivalent to
              ChatGPT sign-in.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
