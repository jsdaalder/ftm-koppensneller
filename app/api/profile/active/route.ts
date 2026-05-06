export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { getActiveProfile } from "@/lib/server/profiles";

function safeFilename(input: string): string {
  return input.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file";
}

export async function GET(req: Request) {
  try {
    await requireUser();
    const active = await getActiveProfile();
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") || "json").toLowerCase();

    if (format === "md" || format === "markdown") {
      const base = safeFilename(active.profile_id || "super-prompt");
      return new NextResponse(active.prompt_markdown, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"${base}.md\"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json(
      {
        profile_id: active.profile_id,
        prompt_markdown: active.prompt_markdown,
        meta_json: active.meta_json,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Onbekende fout.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" || msg === "FORBIDDEN_FTM_NOT_VERIFIED" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

