import { get, list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import {
  getConversationPrefix,
  hasTeacherAccess,
  teacherUnauthorized,
} from "../../history";

export async function GET(req: NextRequest) {
  if (!hasTeacherAccess(req)) return teacherUnauthorized();

  try {
    const result = await list({ prefix: `${getConversationPrefix()}/` });
    const conversations = await Promise.all(
      result.blobs
        .filter((blob) => blob.pathname.endsWith(".json"))
        .map(async (blob) => {
          const fallbackStudentId = blob.pathname.split("/").at(-2) ?? "";
          try {
            const file = await get(blob.pathname, {
              access: "private",
              useCache: false,
            });
            if (!file || file.statusCode !== 200) {
              throw new Error("Transcript is not available.");
            }

            const conversation = JSON.parse(
              await new Response(file.stream).text(),
            ) as {
              studentId?: string;
              studentName?: string;
              topic?: string;
              updatedAt?: string;
            };

            return {
              pathname: blob.pathname,
              studentId: conversation.studentId ?? fallbackStudentId,
              studentName: conversation.studentName ?? "",
              topic: conversation.topic ?? "",
              updatedAt:
                conversation.updatedAt ?? blob.uploadedAt.toISOString(),
            };
          } catch {
            return {
              pathname: blob.pathname,
              studentId: fallbackStudentId,
              studentName: "",
              topic: "",
              updatedAt: blob.uploadedAt.toISOString(),
            };
          }
        }),
    );
    conversations.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("[Conversation History] could not list transcripts", error);
    return NextResponse.json(
      { error: true, message: "Could not load saved conversations." },
      { status: 500 },
    );
  }
}

export const runtime = "edge";
