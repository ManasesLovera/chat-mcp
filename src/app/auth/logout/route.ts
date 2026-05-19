import { clearSessionCookie } from "@/server/auth";
import { jsonResponse } from "@/server/http";

export const runtime = "nodejs";

export async function POST() {
  await clearSessionCookie();
  return jsonResponse({ ok: true });
}
