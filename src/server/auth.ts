import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decryptJson, encryptJson } from "@/server/crypto";
import {
  AUTH_COOKIE_NAME,
  LOGIN_STATE_COOKIE_NAME,
} from "@/server/env";
import { createUser, getOpenAISessionByUserId, getUserById } from "@/server/db";

type SessionPayload = {
  userId: string;
};

function buildCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 30) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return null;
  }

  try {
    const payload = decryptJson<SessionPayload>(sessionCookie);
    return getUserById(payload.userId);
  } catch {
    return null;
  }
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireCurrentUserForRoute() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("AUTH_REQUIRED");
  }

  return user;
}

export async function setSessionCookie(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(
    AUTH_COOKIE_NAME,
    encryptJson({ userId }),
    buildCookieOptions(),
  );
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

export async function beginOpenAILogin() {
  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(
    LOGIN_STATE_COOKIE_NAME,
    state,
    buildCookieOptions(60 * 10),
  );

  return state;
}

export async function consumeOpenAILoginState(expectedState: string) {
  const cookieStore = await cookies();
  const actual = cookieStore.get(LOGIN_STATE_COOKIE_NAME)?.value;
  cookieStore.delete(LOGIN_STATE_COOKIE_NAME);
  return actual === expectedState;
}

export async function ensureSessionUser() {
  const existing = await getCurrentUser();
  if (existing) {
    return existing;
  }

  const user = createUser();
  await setSessionCookie(user.id);
  return user;
}

export async function getAuthContext() {
  const user = await getCurrentUser();
  const openaiSession = user ? getOpenAISessionByUserId(user.id) : null;

  return {
    user,
    isLoggedInToApp: Boolean(user),
    hasOpenAIConnection: Boolean(openaiSession),
    hasOpenAICredential: Boolean(openaiSession),
    chatUnlocked: Boolean(user && openaiSession),
    openaiConnectionMode: openaiSession ? "api_key_fallback" : "none",
    oauthSupport: "unsupported_for_third_party_local_apps",
  };
}
