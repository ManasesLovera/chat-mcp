import { beginOpenAILogin } from "@/server/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const state = await beginOpenAILogin();
  const callbackUrl = new URL(
    `/auth/openai/callback?state=${encodeURIComponent(state)}&mode=fallback`,
    request.url,
  );
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Continue with OpenAI</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #212121;
        color: #ececec;
      }
      main {
        width: min(460px, calc(100vw - 32px));
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: #2f2f2f;
        border-radius: 24px;
        padding: 28px;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
      }
      h1 { margin: 0 0 10px; font-size: 1.5rem; }
      p { margin: 0 0 14px; color: #b4b4b4; line-height: 1.6; }
      .cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        margin-top: 12px;
        border-radius: 999px;
        background: #ffffff;
        color: #111111;
        font-weight: 600;
        text-decoration: none;
        padding: 14px 18px;
      }
      .link {
        color: #ececec;
        text-decoration: underline;
      }
      small {
        display: block;
        margin-top: 14px;
        color: #8f8f8f;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Continue with OpenAI</h1>
      <p>
        Public OpenAI docs currently describe API bearer-token auth, but do not
        expose a supported third-party local-app identity OAuth flow equivalent
        to ChatGPT or Codex sign-in.
      </p>
      <p>
        This browser prompt creates a local app session first. You will connect
        an encrypted OpenAI bearer credential in settings before chat unlocks.
      </p>
      <a class="cta" href="${callbackUrl.toString()}">Continue</a>
      <small>
        Optional reference:
        <a class="link" href="https://platform.openai.com/docs/api-reference/authentication?api-mode=responses" target="_blank" rel="noreferrer">OpenAI API authentication</a>
      </small>
    </main>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
