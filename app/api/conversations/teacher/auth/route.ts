import { NextRequest, NextResponse } from "next/server";
import { hasTeacherAccess, teacherUnauthorized } from "../../history";

export async function GET(req: NextRequest) {
  if (!hasTeacherAccess(req)) return teacherUnauthorized();

  return NextResponse.json({ ok: true });
}

export const runtime = "edge";
