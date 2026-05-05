export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { exportApprovedFeedbackLessons } from "@/lib/server/approved_feedback_lessons_export";

function assertCronSecret(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) throw new Error("MISSING_CRON_SECRET");
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (!token || token !== expected) throw new Error("FORBIDDEN_CRON");
}

export async function POST(req: Request) {
  try {
    assertCronSecret(req);
    const result = await exportApprovedFeedbackLessons({ force: false });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error.";
    const status =
      msg === "FORBIDDEN_CRON" ? 403 : msg === "MISSING_CRON_SECRET" ? 500 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

