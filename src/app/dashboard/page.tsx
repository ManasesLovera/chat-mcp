import { AppShell } from "@/components/app-shell";
import { DashboardClient } from "@/components/dashboard-client";
import { requireCurrentUser } from "@/server/auth";
import {
  getOpenAISessionByUserId,
  listMcpServerConfigsByUserId,
  listToolSnapshotsForServers,
} from "@/server/db";
import { redactConfig } from "@/server/redaction";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const configs = listMcpServerConfigsByUserId(user.id);
  const toolSnapshots = listToolSnapshotsForServers(configs.map((config) => config.id));
  const toolsByConfigId = Object.groupBy(
    toolSnapshots.map((snapshot) => ({
      id: snapshot.id,
      toolName: snapshot.toolName,
      description: snapshot.description,
      inputSchema: JSON.parse(snapshot.inputSchemaJson),
      discoveredAt: snapshot.discoveredAt,
      serverConfigId: snapshot.serverConfigId,
    })),
    (snapshot) => snapshot.serverConfigId,
  );

  return (
    <AppShell user={user} currentPath="/dashboard">
      <DashboardClient
        configs={configs.map(redactConfig)}
        toolsByConfigId={Object.fromEntries(
          Object.entries(toolsByConfigId).map(([key, value]) => [key, value ?? []]),
        )}
        hasOpenAIConnection={Boolean(getOpenAISessionByUserId(user.id))}
      />
    </AppShell>
  );
}
