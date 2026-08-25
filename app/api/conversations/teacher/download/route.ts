import { get, list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import {
  getConversationPrefix,
  hasTeacherAccess,
  teacherUnauthorized,
} from "../../history";

const EXCLUDED_STUDENT_IDS = new Set(["999999999", "123456789"]);
const MAX_BATCH_CONVERSATIONS = 500;
const encoder = new TextEncoder();

type ConversationMessage = {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
};

type Conversation = {
  studentId?: string;
  studentName?: string;
  topic?: string;
  updatedAt?: string;
  messages?: ConversationMessage[];
};

function dateBoundary(date: string | null, endOfDay: boolean) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const timestamp = new Date(
    `${date}T${endOfDay ? "23:59:59.999" : "00:00:00"}+08:00`,
  ).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function messageText(message: ConversationMessage) {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .map((part) => (part.type === "text" ? part.text ?? "" : "[Image]"))
    .join("\n");
}

function buildMarkdown(conversation: Conversation) {
  const studentId = conversation.studentId ?? "";
  const studentName = conversation.studentName ?? "";
  return (
    `# ${conversation.topic || "Conversation"}\n\n` +
    `Student: ${studentName} (${studentId})\n\n` +
    (conversation.messages ?? [])
      .map((message) => {
        const heading = message.role === "user" ? "Student" : "Assistant";
        return `## ${heading}\n${messageText(message).trim()}`;
      })
      .join("\n\n")
  );
}

function safeFilenamePart(value: string) {
  return (
    value
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "unknown"
  );
}

function timestampPart(value?: string) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime())
    ? "unknown-time"
    : date
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts: Uint8Array[]) {
  const output = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function zipFiles(files: Array<{ name: string; content: string }>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const content = encoder.encode(file.content);
    const checksum = crc32(content);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, content.length, true);
    localView.setUint32(22, content.length, true);
    localView.setUint16(26, name.length, true);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, content.length, true);
    centralView.setUint32(24, content.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);

    localParts.push(localHeader, name, content);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, localOffset, true);
  return concatBytes([...localParts, centralDirectory, end]);
}

export async function GET(req: NextRequest) {
  if (!hasTeacherAccess(req)) return teacherUnauthorized();

  try {
    const from = dateBoundary(req.nextUrl.searchParams.get("from"), false);
    const to = dateBoundary(req.nextUrl.searchParams.get("to"), true);
    const hasCustomRange = from !== undefined || to !== undefined;
    const effectiveFrom =
      from ??
      (hasCustomRange ? undefined : Date.now() - 15 * 24 * 60 * 60 * 1000);
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

    const candidates = blobs.filter(
      (blob) =>
        blob.pathname.endsWith(".json") &&
        (effectiveFrom === undefined ||
          blob.uploadedAt.getTime() >= effectiveFrom) &&
        (to === undefined || blob.uploadedAt.getTime() <= to),
    );

    if (candidates.length > MAX_BATCH_CONVERSATIONS) {
      return NextResponse.json(
        {
          message: `Please choose a narrower range (maximum ${MAX_BATCH_CONVERSATIONS} conversations).`,
        },
        { status: 413 },
      );
    }

    const conversations = await Promise.all(
      candidates.map(async (blob) => {
        const file = await get(blob.pathname, {
          access: "private",
          useCache: false,
        });
        if (!file || file.statusCode !== 200) return null;
        const conversation = JSON.parse(
          await new Response(file.stream).text(),
        ) as Conversation;
        return EXCLUDED_STUDENT_IDS.has(conversation.studentId ?? "")
          ? null
          : conversation;
      }),
    );

    const files = conversations.flatMap((conversation, index) =>
      conversation
        ? [
            {
              name: `${safeFilenamePart(
                conversation.studentId ?? "",
              )}-${safeFilenamePart(
                conversation.studentName ?? "",
              )}-conversation-${timestampPart(conversation.updatedAt)}-${
                index + 1
              }.md`,
              content: buildMarkdown(conversation),
            },
          ]
        : [],
    );

    if (files.length === 0) {
      return NextResponse.json(
        { message: "No eligible conversations found in this date range." },
        { status: 404 },
      );
    }

    const zip = zipFiles(files);
    const rangeName = `${req.nextUrl.searchParams.get("from") || "recent"}-${
      req.nextUrl.searchParams.get("to") || "today"
    }`;
    return new NextResponse(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="conversations-${rangeName}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(
      "[Conversation History] could not create batch download",
      error,
    );
    return NextResponse.json(
      { message: "Could not create the conversation download." },
      { status: 500 },
    );
  }
}

export const runtime = "edge";
