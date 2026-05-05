export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCreator, requireUser } from "@/lib/server/auth";

export async function GET() {
  try {
    const user = await requireUser();
    await requireCreator(user.id);

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({
      perPage: 200,
      page: 1,
    });
    if (error) throw error;

    const users = (data?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at ?? null,
      last_sign_in_at: (u as unknown as { last_sign_in_at?: string | null }).last_sign_in_at ?? null,
      email_confirmed_at: (u as unknown as { email_confirmed_at?: string | null }).email_confirmed_at ?? null,
    }));

    return NextResponse.json({ users });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Onbekende fout.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

