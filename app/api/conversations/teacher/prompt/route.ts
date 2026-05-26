import { NextRequest, NextResponse } from "next/server";
import { getTutorSystemPrompt } from "../../../openai/tutor-system-prompt";
import { hasTeacherAccess, teacherUnauthorized } from "../../history";

export async function GET(req: NextRequest) {
  if (!process.env.TEACHER_HISTORY_CODE) {
    return NextResponse.json(
      { error: true, message: "Teacher prompt viewing is not configured." },
      { status: 503 },
    );
  }

  if (!hasTeacherAccess(req)) return teacherUnauthorized();

  return NextResponse.json({ prompt: getTutorSystemPrompt() });
}

export const runtime = "edge";
