import { getAuthContext } from "@/server/auth";
import { jsonResponse } from "@/server/http";

export const runtime = "nodejs";

export async function GET() {
  return jsonResponse(await getAuthContext());
}
