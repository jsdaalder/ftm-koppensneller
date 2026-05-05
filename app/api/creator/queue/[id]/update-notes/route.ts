export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCreator, requireUser } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/security";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    await requireCreator(user.id);
    const { id } = await ctx.params;
    const notes = (await req.formData().catch(() => null))?.get("notes")?.toString() ?? "";

    const admin = createSupabaseAdminClient();
    await admin
      .from("feedback_submissions")
      .update({ review_notes: notes })
      .eq("id", id);
    await admin.from("audit_log").insert({
      actor_user_id: user.id,
      action: "update_feedback_review_notes",
      target_id: id,
      notes,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Onbekende fout.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

