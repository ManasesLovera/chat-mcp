import { decryptText } from "@/server/crypto";
import { getOpenAISessionByUserId } from "@/server/db";
import { OPENAI_MODEL } from "@/server/env";

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

export function getOpenAIKeyForUser(userId: string) {
  const session = getOpenAISessionByUserId(userId);
  if (session) {
    return normalizeToken(decryptText(session.accessTokenEncrypted));
  }

  if (process.env.OPENAI_API_KEY) {
    return normalizeToken(process.env.OPENAI_API_KEY);
  }

  throw new Error(
    "No OpenAI API credential is connected for this user. Connect one on the dashboard before running agent tests.",
  );
}

function normalizeToken(value: string) {
  return value.replace(/^Bearer\s+/i, "").trim();
}

export async function createChatCompletion(input: {
  userId: string;
  messages: ChatCompletionMessage[];
  tools: FunctionToolDefinition[];
}) {
  const apiKey = getOpenAIKeyForUser(input.userId);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: input.messages,
      tools: input.tools,
      tool_choice: "auto",
      temperature: 0.2,
      parallel_tool_calls: false,
    }),
  });

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
    throw new Error(data.error?.message ?? "OpenAI request failed.");
  }

  const choice = data.choices?.[0];
  if (!choice) {
    throw new Error("OpenAI returned no completion choices.");
  }

  return choice.message;
}
