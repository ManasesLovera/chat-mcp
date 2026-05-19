import type { MCPServerConfigRecord } from "@/server/types";

export function redactEnv(env: Record<string, string>) {
  return Object.fromEntries(Object.keys(env).map((key) => [key, "[REDACTED]"]));
}

export function redactConfig(config: MCPServerConfigRecord) {
  return {
    ...config,
    env: redactEnv(config.env),
  };
}
