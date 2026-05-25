import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import {
  getConversationPrefix,
  hasTeacherAccess,
  teacherUnauthorized,
} from "../../history";

export async function DELETE(req: NextRequest) {
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

  try {
    await del(pathname);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Conversation History] could not delete transcript", error);
    return NextResponse.json(
      { error: true, message: "Could not delete that conversation." },
      { status: 500 },
    );
  }
}

export const runtime = "edge";
