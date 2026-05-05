export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { upsertApprovedFeedbackExport, getLatestApprovedFeedbackExport } from "@/lib/server/approved_feedback_export";

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
    if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data: latestApproved } = await admin
      .from("feedback_submissions")
      .select("reviewed_at,created_at")
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const latestExport = await getLatestApprovedFeedbackExport();
    const latestSubmissionAt = (latestApproved?.reviewed_at ?? latestApproved?.created_at ?? null) as string | null;
    if (latestExport && latestSubmissionAt) {
      // If nothing new since the last export, no-op.
      if (new Date(latestExport.generated_at).getTime() >= new Date(latestSubmissionAt).getTime()) {
        return NextResponse.json({ status: "no-op" });
      }
    }

    const result = await upsertApprovedFeedbackExport();
    return NextResponse.json({ status: "ok", export_id: result.id, source_count: result.sourceCount });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}

