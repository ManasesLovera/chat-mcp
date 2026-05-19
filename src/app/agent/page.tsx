import { AppShell } from "@/components/app-shell";
import { AgentClient } from "@/components/agent-client";
import { requireCurrentUser } from "@/server/auth";
import { getOpenAISessionByUserId, listMcpServerConfigsByUserId } from "@/server/db";

export default async function AgentPage() {
  const user = await requireCurrentUser();
  const configs = listMcpServerConfigsByUserId(user.id).filter((config) => config.isEnabled);

  return (
    <AppShell user={user} currentPath="/agent">
      <AgentClient
        configs={configs.map((config) => ({
          id: config.id,
          name: config.name,
          isEnabled: config.isEnabled,
          transportType: config.transportType,
        }))}
        hasOpenAIConnection={Boolean(getOpenAISessionByUserId(user.id))}
      />
    </AppShell>
  );
}
