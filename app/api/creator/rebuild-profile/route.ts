export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadGuidelinesBundle } from "@/lib/server/generator";
import { getActiveProfile, upsertActiveProfile } from "@/lib/server/profiles";
import { runOpenAIText } from "@/lib/server/openai";
import { requireCreator, requireUser } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/security";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    await requireCreator(user.id);
    const admin = createSupabaseAdminClient();
    const { data: approved } = await admin
      .from("feedback_submissions")
      .select("id,payload_json,review_notes,created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(200);

    const current = await getActiveProfile();
    const guidelines = await loadGuidelinesBundle();
    const lessonsText = JSON.stringify(approved ?? []);
    const model = process.env.BUILD_PROFILE_MODEL || "gpt-5.5";

    const promptMarkdown = await runOpenAIText({
      model,
      systemPrompt:
        "Je bent een senior headline-editor voor Follow the Money. Schrijf een herbruikbaar, uitgebreid promptprofiel in het Nederlands.",
      userPrompt: `
HUIDIG PROFIEL:
${current.prompt_markdown}

RICHTLIJNEN:
${guidelines}

GOEDGEKEURDE LESSONS:
${lessonsText}

Lever alleen markdown op voor een nieuw super prompt-profiel.
`,
    });

    const profileId = `web_profile_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
    await upsertActiveProfile({
      profileId,
      promptMarkdown,
      metaJson: {
        built_from: current.profile_id,
        approved_lessons_count: (approved ?? []).length,
        model,
        rebuilt_at: new Date().toISOString(),
      },
    });

    await admin.from("audit_log").insert({
      actor_user_id: user.id,
      action: "rebuild_profile",
      target_id: profileId,
      notes: `approved_lessons=${(approved ?? []).length}`,
    });

    return NextResponse.json({ status: "ok", profile_id: profileId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Onbekende fout.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
