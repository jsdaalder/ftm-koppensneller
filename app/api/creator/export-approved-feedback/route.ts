export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireCreator, requireUser } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/security";
import { upsertApprovedFeedbackExport } from "@/lib/server/approved_feedback_export";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    await requireCreator(user.id);
    const result = await upsertApprovedFeedbackExport();
    return NextResponse.json({ status: "ok", export_id: result.id, source_count: result.sourceCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Onbekende fout.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

