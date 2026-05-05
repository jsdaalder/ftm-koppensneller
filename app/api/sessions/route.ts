export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { assertEnv } from "@/lib/env";
import { extractDocxText } from "@/lib/docx";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/server/auth";
import { summarizeDraftText } from "@/lib/server/draft_summary";
import { generateSuggestions, loadGuidelinesBundle } from "@/lib/server/generator";
import { getActiveProfile, sha256 } from "@/lib/server/profiles";
import { assertSameOrigin } from "@/lib/server/security";
import { enforceDailyGenerationLimit } from "@/lib/server/usage";
import { errorToMessage } from "@/lib/server/errors";

function getDraftKind(filename: string): "md" | "unknown" {
  const name = filename.toLowerCase();
  if (name.endsWith(".md")) return "md";
  return "unknown";
}

export async function POST(req: Request) {
  try {
    assertEnv();
    assertSameOrigin(req);
    const user = await requireUser();
    await enforceDailyGenerationLimit(user.id);

    const formData = await req.formData();
    const file = formData.get("draft");
    const genre = String(formData.get("genre") || "news");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload exactly one draft file (.md)." }, { status: 400 });
    }
    const kind = getDraftKind(file.name);
    if (kind === "unknown") {
      return NextResponse.json({ error: "Only .md files are allowed." }, { status: 400 });
    }
    // Keep comfortably below Vercel request body limits. Larger drafts should be reduced (remove images).
    if (kind === "md" && file.size > 512 * 1024) {
      return NextResponse.json({ error: "File too large (max 512 KB for .md). Try splitting the text or removing embeds." }, { status: 400 });
    }

    const draftText = await file.text();
    const { summary: draftSummary } = await summarizeDraftText({ draftText, genre });
    const profile = await getActiveProfile();
    const guidelines = await loadGuidelinesBundle();
    const suggestions = await generateSuggestions({
      profilePrompt: profile.prompt_markdown,
      guidelinesText: guidelines,
      draftText,
      genre,
      roundNumber: 1,
      feedbackHistory: "",
    });

    const admin = createSupabaseAdminClient();
    const { data: session, error: sessionErr } = await admin
      .from("web_sessions")
      .insert({
        user_id: user.id,
        profile_id: profile.profile_id,
        genre,
        draft_hash: sha256(draftText),
        draft_summary: draftSummary,
      })
      .select("id")
      .single();
    if (sessionErr) throw sessionErr;

    const { error: roundErr } = await admin.from("session_rounds").insert({
      session_id: session.id,
      round_number: 1,
      suggestions_json: suggestions,
      selected_indices: [],
      feedback_text: "",
      direction_tags: [],
      user_revision_text: "",
    });
    if (roundErr) throw roundErr;

    return NextResponse.json({
      session_id: session.id,
      round_number: 1,
      suggestions,
      profile_id: profile.profile_id,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN_EMAIL_DOMAIN") {
      return NextResponse.json({ error: "Only approved internal email domains are allowed." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN_NO_ROLE") {
      return NextResponse.json({ error: "No access role found. Ask admin for access." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN_FTM_NOT_VERIFIED") {
      return NextResponse.json({ error: "FORBIDDEN_FTM_NOT_VERIFIED" }, { status: 403 });
    }
    if (err instanceof Error && err.message === "DAILY_LIMIT_REACHED") {
      return NextResponse.json({ error: "Daily user limit reached. Try again tomorrow or ask admin to increase limit." }, { status: 429 });
    }
    if (err instanceof Error && err.message === "GLOBAL_DAILY_LIMIT_REACHED") {
      return NextResponse.json({ error: "Global daily app limit reached. Try again tomorrow." }, { status: 429 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN_ORIGIN") {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
    return NextResponse.json({ error: errorToMessage(err) }, { status: 500 });
  }
}
