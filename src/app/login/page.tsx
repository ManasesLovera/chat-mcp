import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-4 py-10">
      <main className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="panel rounded-[2.5rem] p-8 sm:p-10">
          <p className="eyebrow">Local MCP Agent Lab</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Local MCP server testing with persisted traces and app-owned config.
          </h1>
          <p className="muted mt-5 max-w-2xl text-base leading-8">
            Configure local stdio MCP servers in SQLite, discover their tools,
            expose them to an OpenAI-backed agent together with a built-in web
            search tool, and inspect every tool call from the browser.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <span className="tag">SQLite-backed configs</span>
            <span className="tag">stdio MCP first</span>
            <span className="tag">web_search built in</span>
            <span className="tag">tool-call history</span>
          </div>
        </section>

        <section className="panel-strong rounded-[2.5rem] p-8 sm:p-10">
          <p className="eyebrow">Sign-in flow</p>
          <h2 className="mt-3 text-2xl font-semibold">
            Continue with OpenAI
          </h2>
          <p className="muted mt-4 text-sm leading-7">
            The app preserves the requested OpenAI-oriented browser sign-in
            entrypoint, but current public OpenAI docs do not expose a supported
            third-party local-app identity OAuth flow equivalent to ChatGPT or
            Codex sign-in. This flow creates a local app session, and you will
            then connect an encrypted OpenAI API credential on the dashboard for
            actual model calls.
          </p>

          <Link
            href="/auth/openai/login"
            className="btn-primary mt-8 inline-flex rounded-full px-6 py-3 font-medium transition"
          >
            Continue with OpenAI
          </Link>

          <div className="mt-8 rounded-3xl border border-[var(--border)] bg-[rgba(14,122,83,0.05)] p-5">
            <p className="text-sm font-medium">Hard requirements honored</p>
            <ul className="muted mt-3 space-y-2 text-sm leading-6">
              <li>No reads from <span className="mono">~/.codex/config.toml</span>.</li>
              <li>No reads from <span className="mono">.codex/config.toml</span>.</li>
              <li>All MCP config is app-owned and stored in SQLite.</li>
              <li>OpenAI secrets are encrypted at rest in the app database.</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
