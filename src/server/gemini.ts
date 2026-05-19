import { decryptText } from "@/server/crypto";
import { getGeminiSessionByUserId } from "@/server/db";
import { GEMINI_MODEL } from "@/server/env";

type ChatCompletionMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown;
};

type FunctionToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export function getGeminiKeyForUser(userId: string) {
  const session = getGeminiSessionByUserId(userId);
  if (session) {
    return normalizeToken(decryptText(session.accessTokenEncrypted));
  }

  if (process.env.GEMINI_API_KEY) {
    return normalizeToken(process.env.GEMINI_API_KEY);
  }

  throw new Error(
    "No Gemini API credential is connected for this user. Connect one on the dashboard before running agent tests.",
  );
}

function normalizeToken(value: string) {
  return value.replace(/^Bearer\s+/i, "").trim();
}

export async function createGeminiChatCompletion(input: {
  userId: string;
  messages: ChatCompletionMessage[];
  tools: FunctionToolDefinition[];
}) {
  const apiKey = getGeminiKeyForUser(input.userId);
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages: input.messages,
        tools: input.tools.length > 0 ? input.tools : undefined,
        tool_choice: input.tools.length > 0 ? "auto" : undefined,
        temperature: 0.2,
      }),
    },
  );

  const data = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{
      message: {
        role: "assistant";
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          type: "function";
          function: {
            name: string;
            arguments: string;
          };
        }>;
      };
      finish_reason?: string | null;
    }>;
  };

  if (!response.ok) {
    throw new Error(data.error?.message ?? `Gemini request failed with status ${response.status}`);
  }

  const choice = data.choices?.[0];
  if (!choice) {
    throw new Error("Gemini returned no completion choices.");
  }

  return choice.message;
}
