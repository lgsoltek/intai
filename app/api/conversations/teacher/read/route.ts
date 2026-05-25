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

  try {
    const blob = await get(pathname, { access: "private", useCache: false });
    if (!blob || blob.statusCode !== 200) {
      return NextResponse.json(
        { error: true, message: "Conversation not found." },
        { status: 404 },
      );
    }

    const rawConversation = await new Response(blob.stream).text();
    if (!rawConversation.trim()) {
      throw new Error("Empty conversation body.");
    }

    return NextResponse.json(JSON.parse(rawConversation));
  } catch (error) {
    console.error("[Conversation History] could not read transcript", error);
    return NextResponse.json(
      { error: true, message: "Could not read that conversation." },
      { status: 500 },
    );
  }
}

export const runtime = "edge";
