import { get, list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { pinyin } from "pinyin-pro";
import {
  getConversationPrefix,
  hasTeacherAccess,
  teacherUnauthorized,
} from "../../history";

const DEFAULT_RECENT_DAYS = 15;

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

function dateBoundary(date: string | null, endOfDay: boolean) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const timestamp = new Date(
    `${date}T${endOfDay ? "23:59:59.999" : "00:00:00"}+08:00`,
  ).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

export async function GET(req: NextRequest) {
  if (!hasTeacherAccess(req)) return teacherUnauthorized();

  try {
    const customFrom = dateBoundary(
      req.nextUrl.searchParams.get("from"),
      false,
    );
    const customTo = dateBoundary(req.nextUrl.searchParams.get("to"), true);
    const hasCustomRange = customFrom !== undefined || customTo !== undefined;
    const from =
      customFrom ??
      (hasCustomRange
        ? undefined
        : Date.now() - DEFAULT_RECENT_DAYS * 24 * 60 * 60 * 1000);
    const blobs = [];
    let cursor: string | undefined;

    do {
      const result = await list({
        prefix: `${getConversationPrefix()}/`,
        cursor,
      });
      blobs.push(...result.blobs);
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);

    const conversations = await Promise.all(
      blobs
        .filter(
          (blob) =>
            blob.pathname.endsWith(".json") &&
            (from === undefined || blob.uploadedAt.getTime() >= from) &&
            (customTo === undefined || blob.uploadedAt.getTime() <= customTo),
        )
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

    return NextResponse.json({
      conversations,
      isRecentWindow: !hasCustomRange,
      recentDays: DEFAULT_RECENT_DAYS,
    });
  } catch (error) {
    console.error("[Conversation History] could not list transcripts", error);
    return NextResponse.json(
      { error: true, message: "Could not load saved conversations." },
      { status: 500 },
    );
  }
}

export const runtime = "edge";
