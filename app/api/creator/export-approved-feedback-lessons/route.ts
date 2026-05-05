export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/server/security";
import { requireCreator, requireUser } from "@/lib/server/auth";
import { exportApprovedFeedbackLessons } from "@/lib/server/approved_feedback_lessons_export";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    await requireCreator(user.id);
    const result = await exportApprovedFeedbackLessons({ force: true });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN_ORIGIN") {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN_NO_ROLE") {
      return NextResponse.json({ error: "Creator only." }, { status: 403 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error." }, { status: 500 });
  }
}

