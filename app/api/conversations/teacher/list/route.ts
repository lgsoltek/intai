import { get, list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { pinyin } from "pinyin-pro";
import {
  getConversationPrefix,
  hasTeacherAccess,
  teacherUnauthorized,
} from "../../history";

function getNameSortData(name: string) {
  const nameSortKey = pinyin(name, {
    toneType: "none",
    type: "array",
  })
    .join(" ")
    .trim()
    .toLocaleLowerCase();

  return {
    nameSortKey: nameSortKey || name.toLocaleLowerCase(),
    nameInitial: nameSortKey.charAt(0).toLocaleUpperCase() || "#",
  };
}

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

            const studentName = conversation.studentName ?? "";
            return {
              pathname: blob.pathname,
              studentId: conversation.studentId ?? fallbackStudentId,
              studentName,
              topic: conversation.topic ?? "",
              updatedAt:
                conversation.updatedAt ?? blob.uploadedAt.toISOString(),
              ...getNameSortData(studentName),
            };
          } catch {
            return {
              pathname: blob.pathname,
              studentId: fallbackStudentId,
              studentName: "",
              topic: "",
              updatedAt: blob.uploadedAt.toISOString(),
              ...getNameSortData(""),
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
