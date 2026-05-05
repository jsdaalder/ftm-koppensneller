export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCreator, requireUser } from "@/lib/server/auth";

export async function GET() {
  try {
    const user = await requireUser();
    await requireCreator(user.id);
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("feedback_submissions")
      .select("id,session_id,user_id,status,payload_json,review_notes,created_at,reviewed_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const uniqueUserIds = Array.from(new Set((data ?? []).map((row) => row.user_id).filter(Boolean)));
    const emailByUserId = new Map<string, string>();
    await Promise.all(
      uniqueUserIds.map(async (id) => {
        try {
          const { data: userData, error: userErr } = await admin.auth.admin.getUserById(id);
          if (userErr || !userData?.user?.email) return;
          emailByUserId.set(id, userData.user.email);
        } catch {
          // Ignore lookup failures; email is best-effort.
        }
      }),
    );

    const enriched = (data ?? []).map((row) => ({
      ...row,
      user_email: emailByUserId.get(row.user_id) ?? null,
    }));

    return NextResponse.json({ items: enriched });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Onbekende fout.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
