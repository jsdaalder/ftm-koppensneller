export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireCreator, requireUser } from "@/lib/server/auth";
import { runWeeklyFeedbackDigest } from "@/lib/server/weekly_digest";
import { assertSameOrigin } from "@/lib/server/security";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    await requireCreator(user.id);
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";
    const result = await runWeeklyFeedbackDigest({ force });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
