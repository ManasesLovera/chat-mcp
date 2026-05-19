import { consumeGeminiLoginState, ensureSessionUser, setSessionCookie } from "@/server/auth";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");

  if (!state) {
    return errorResponse(400, "Missing login state.");
  }

  const isValid = await consumeGeminiLoginState(state);
  if (!isValid) {
    return errorResponse(400, "Gemini login state was invalid or expired.");
  }

  const user = await ensureSessionUser();
  await setSessionCookie(user.id);
  const redirectUrl = new URL("/", request.url);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gemini connection complete</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #212121;
        color: #ececec;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main { text-align: center; padding: 32px; }
      a { color: #fff; }
    </style>
  </head>
  <body>
    <main>
      <p>Connected. You can close this window.</p>
      <p><a href="${redirectUrl.toString()}">Return to chat</a></p>
    </main>
    <script>
      try {
        if (window.opener) {
          window.opener.postMessage({ type: "gemini-login-complete" }, ${JSON.stringify(
            redirectUrl.origin,
          )});
          window.close();
        } else {
          window.location.replace(${JSON.stringify(redirectUrl.toString())});
        }
      } catch {
        window.location.replace(${JSON.stringify(redirectUrl.toString())});
      }
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
