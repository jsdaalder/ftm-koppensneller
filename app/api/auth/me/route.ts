export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireUser, isCreator } from "@/lib/server/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const creator = await isCreator(user.id, user.email ?? null);
    return NextResponse.json({ is_creator: creator });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Onbekende fout.";
    const status =
      msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" || msg === "FORBIDDEN_FTM_NOT_VERIFIED" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

