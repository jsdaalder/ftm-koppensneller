export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/server/security";
import { errorToMessage } from "@/lib/server/errors";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(_req);
    const params = await ctx.params;
    const sessionId = params.id;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data: session } = await admin
      .from("web_sessions")
      .select("id,user_id,profile_id,genre,draft_summary,created_at")
      .eq("id", sessionId)
      .single();
    if (!session || session.user_id !== user.id) {
      return NextResponse.json({ error: "Geen toegang tot sessie." }, { status: 403 });
    }
    const { data: rounds } = await admin
      .from("session_rounds")
      .select("round_number,suggestions_json,selected_indices,feedback_text,direction_tags,user_revision_text")
      .eq("session_id", sessionId)
      .order("round_number", { ascending: true });

    const payload = { session, rounds: rounds ?? [] };
    const { data: existing, error: existingErr } = await admin
      .from("feedback_submissions")
      .select("id,status")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingErr) throw existingErr;

    if (existing) {
      const { error: updateErr } = await admin
        .from("feedback_submissions")
        .update({
          payload_json: payload,
          status: existing.status === "approved" ? "approved" : "pending",
          reviewed_at: existing.status === "approved" ? undefined : null,
        })
        .eq("id", existing.id);
      if (updateErr) throw updateErr;
      return NextResponse.json({ status: "ok", submission_id: existing.id, mode: "updated" });
    }

    const { data, error } = await admin
      .from("feedback_submissions")
      .insert({
        session_id: sessionId,
        user_id: user.id,
        status: "pending",
        payload_json: payload,
      })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ status: "ok", submission_id: data.id, mode: "created" });
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN_ORIGIN") {
      return NextResponse.json({ error: "Ongeldige request-origin." }, { status: 403 });
    }
    return NextResponse.json({ error: errorToMessage(err) }, { status: 500 });
  }
}
