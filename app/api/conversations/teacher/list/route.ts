import { list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import {
  getConversationPrefix,
  hasTeacherAccess,
  teacherUnauthorized,
} from "../../history";

export async function GET(req: NextRequest) {
  if (!hasTeacherAccess(req)) return teacherUnauthorized();

  const result = await list({ prefix: `${getConversationPrefix()}/` });
  const conversations = result.blobs
    .filter((blob) => blob.pathname.endsWith(".json"))
    .map((blob) => ({
      pathname: blob.pathname,
      updatedAt: blob.uploadedAt,
    }))
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  return NextResponse.json({ conversations });
}

export const runtime = "edge";
