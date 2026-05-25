import { NextRequest, NextResponse } from "next/server";

export function getConversationPrefix() {
  return process.env.VERCEL_ENV === "production"
    ? "conversations"
    : "test-conversations";
}

export function safePathPart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 100);
}

export function hasTeacherAccess(req: NextRequest) {
  const submitted = req.headers.get("x-teacher-history-code") ?? "";
  const expected = process.env.TEACHER_HISTORY_CODE ?? "";
  if (!expected) return true;
  if (!submitted) return false;

  let mismatch = submitted.length ^ expected.length;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= submitted.charCodeAt(i) ^ (expected.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

export function teacherUnauthorized() {
  return NextResponse.json(
    { error: true, message: "Wrong teacher password." },
    { status: 401 },
  );
}
