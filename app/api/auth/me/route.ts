export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function creatorEmailAllowed(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  const creators = parseCsv(process.env.CREATOR_EMAILS);
  if (creators.length === 0) return false;
  return creators.includes(normalized);
}

async function roleCreatorAllowed(userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "creator";
}

export async function GET() {
  try {
    const user = await requireUser();
    const creator = creatorEmailAllowed(user.email ?? null) || (await roleCreatorAllowed(user.id));
    return NextResponse.json({ is_creator: creator });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Onbekende fout.";
    const status =
      msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" || msg === "FORBIDDEN_FTM_NOT_VERIFIED" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
