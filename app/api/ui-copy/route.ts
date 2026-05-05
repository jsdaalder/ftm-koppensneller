export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { loadUiCopy } from "@/lib/server/ui-copy";

export async function GET() {
  try {
    const copy = await loadUiCopy();
    return NextResponse.json({ copy });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Kon UI-copy niet laden.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
