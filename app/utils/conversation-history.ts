import { ApiPath, ServiceProvider } from "../constant";
import { getHeaders } from "../client/api";
import type { ChatSession } from "../store/chat";

type ConversationIdentity = {
  studentId: string;
  studentName: string;
};

const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();

export function queueConversationSave(
  session: ChatSession,
  identity: ConversationIdentity,
  provider: ServiceProvider,
) {
  if (
    !identity.studentId ||
    !identity.studentName ||
    session.messages.length === 0
  ) {
    return;
  }

  const existing = pendingSaves.get(session.id);
  if (existing) {
    clearTimeout(existing);
  }

  const snapshot = {
    studentId: identity.studentId,
    studentName: identity.studentName,
    sessionId: session.id,
    topic: session.topic,
    updatedAt: new Date(session.lastUpdate).toISOString(),
    messages: session.messages.map(
      ({ streaming: _streaming, ...message }) => message,
    ),
    model: session.mask.modelConfig.model,
    provider,
  };

  pendingSaves.set(
    session.id,
    setTimeout(async () => {
      pendingSaves.delete(session.id);
      try {
        const response = await fetch(`${ApiPath.Conversations}/save`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(snapshot),
        });
        if (!response.ok) {
          console.error(
            "[Conversation History] save rejected",
            response.status,
          );
        }
      } catch (error) {
        console.error("[Conversation History] failed to save", error);
      }
    }, 3000),
  );
}
