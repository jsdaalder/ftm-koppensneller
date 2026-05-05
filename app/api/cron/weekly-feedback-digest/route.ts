export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { runWeeklyFeedbackDigest } from "@/lib/server/weekly_digest";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const header = req.headers.get("x-cron-secret") || "";
  return bearer === secret || header === secret;
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";
    const result = await runWeeklyFeedbackDigest({ force });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
