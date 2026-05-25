import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../auth";
import { ModelProvider } from "../../../constant";
import { getConversationPrefix, safePathPart } from "../history";

type ConversationPayload = {
  studentId?: string;
  studentName?: string;
  sessionId?: string;
  topic?: string;
  updatedAt?: string;
  messages?: unknown[];
  model?: string;
  provider?: string;
};

const MAX_TRANSCRIPT_BYTES = 1024 * 1024;

export async function POST(req: NextRequest) {
  const authResult = auth(req, ModelProvider.GPT);
  if (authResult.error) {
    return NextResponse.json(authResult, { status: 401 });
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_TRANSCRIPT_BYTES) {
    return NextResponse.json(
      { error: true, message: "Conversation is too large." },
      { status: 413 },
    );
  }

  let payload: ConversationPayload;
  try {
    payload = JSON.parse(rawBody) as ConversationPayload;
  } catch {
    return NextResponse.json(
      { error: true, message: "Invalid conversation data." },
      { status: 400 },
    );
  }

  if (
    !payload.studentId ||
    !payload.studentName ||
    !payload.sessionId ||
    !Array.isArray(payload.messages)
  ) {
    return NextResponse.json(
      { error: true, message: "Missing conversation fields." },
      { status: 400 },
    );
  }

  const studentId = safePathPart(payload.studentId);
  const sessionId = safePathPart(payload.sessionId);
  if (!studentId || !sessionId) {
    return NextResponse.json(
      { error: true, message: "Invalid student or session." },
      { status: 400 },
    );
  }

  const savedConversation = {
    version: 1,
    studentId: payload.studentId,
    studentName: payload.studentName,
    sessionId: payload.sessionId,
    topic: payload.topic ?? "",
    createdAt:
      (payload.messages[0] as { date?: string } | undefined)?.date ??
      payload.updatedAt,
    updatedAt: payload.updatedAt ?? new Date().toISOString(),
    messageCount: payload.messages.length,
    messages: payload.messages,
    model: payload.model ?? "",
    provider: payload.provider ?? "",
    deployment: process.env.VERCEL_URL ?? "",
  };

  const pathname = `${getConversationPrefix()}/${studentId}/${sessionId}.json`;
  await put(pathname, JSON.stringify(savedConversation, null, 2), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });

  return NextResponse.json({ ok: true });
}

export const runtime = "edge";
