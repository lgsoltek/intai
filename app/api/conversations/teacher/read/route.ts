import { get } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import {
  getConversationPrefix,
  hasTeacherAccess,
  teacherUnauthorized,
} from "../../history";

export async function GET(req: NextRequest) {
  if (!hasTeacherAccess(req)) return teacherUnauthorized();

  const pathname = req.nextUrl.searchParams.get("pathname") ?? "";
  if (
    !pathname.startsWith(`${getConversationPrefix()}/`) ||
    !pathname.endsWith(".json")
  ) {
    return NextResponse.json(
      { error: true, message: "Invalid conversation." },
      { status: 400 },
    );
  }

  const blob = await get(pathname, { access: "private", useCache: false });
  if (!blob || blob.statusCode !== 200) {
    return NextResponse.json(
      { error: true, message: "Conversation not found." },
      { status: 404 },
    );
  }

  return new Response(blob.stream, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export const runtime = "edge";
