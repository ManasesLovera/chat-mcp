import { ChatClient } from "@/components/chat-client";
import { LoginGate } from "@/components/login-gate";
import { getAuthContext } from "@/server/auth";
import {
  getConversationDetailByIdForUser,
  listConversationsByUserId,
  listMcpServerConfigsByUserId,
  listToolSnapshotsForServers,
} from "@/server/db";
import { redactConfig } from "@/server/redaction";

export default async function Home() {
  const auth = await getAuthContext();
  if (!auth.user) {
    return <LoginGate />;
  }

  const conversations = listConversationsByUserId(auth.user.id);
  const initialConversation =
    conversations.length > 0
      ? getConversationDetailByIdForUser(auth.user.id, conversations[0].id)
      : null;
  const configs = listMcpServerConfigsByUserId(auth.user.id);
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
    <ChatClient
      auth={auth}
      initialConversations={conversations}
      initialConversation={initialConversation}
      initialConfigs={configs.map(redactConfig)}
      initialToolsByConfigId={Object.fromEntries(
        Object.entries(toolsByConfigId).map(([key, value]) => [key, value ?? []]),
      )}
    />
  );
}
