export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/server/auth";
import { generateSuggestions, loadGuidelinesBundle } from "@/lib/server/generator";
import { getActiveProfile } from "@/lib/server/profiles";
import { assertSameOrigin } from "@/lib/server/security";
import { enforceDailyGenerationLimit } from "@/lib/server/usage";
import { errorToMessage } from "@/lib/server/errors";

const bodySchema = z.object({
  selected_indices: z.array(z.number()).default([]),
  feedback_text: z.string().default(""),
  user_revision_text: z.string().default(""),
});

function parseDirectionTags(feedback: string): string[] {
  const lower = feedback.toLowerCase();
  const tags: string[] = [];
  if (lower.includes("kort")) tags.push("korter");
  if (lower.includes("voorzichtig")) tags.push("voorzichtiger");
  if (lower.includes("hard")) tags.push("harder");
  if (lower.includes("concreet")) tags.push("concreter");
  return [...new Set(tags)];
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; n: string }> },
) {
  try {
    assertSameOrigin(req);
    const params = await ctx.params;
    const sessionId = params.id;
    const roundNumber = Number(params.n);
    if (!Number.isFinite(roundNumber) || roundNumber < 2) {
      return NextResponse.json({ error: "Invalid round number." }, { status: 400 });
    }

    const user = await requireUser();
    await enforceDailyGenerationLimit(user.id);

    const parsed = bodySchema.parse(await req.json());
    const admin = createSupabaseAdminClient();
    const { data: session } = await admin
      .from("web_sessions")
      .select("id,user_id,genre,profile_id,draft_hash")
      .eq("id", sessionId)
      .single();
    if (!session || session.user_id !== user.id) {
      return NextResponse.json({ error: "No access to this session." }, { status: 403 });
    }

    const { data: rounds } = await admin
      .from("session_rounds")
      .select("round_number,suggestions_json,feedback_text")
      .eq("session_id", sessionId)
      .order("round_number", { ascending: true });

    const feedbackHistory = (rounds ?? [])
      .map((r) => `Ronde ${r.round_number}: ${r.feedback_text || "(geen feedback)"}`)
      .join("\n");
    const lastSuggestions = rounds?.[rounds.length - 1]?.suggestions_json;
    const selectedTexts = parsed.selected_indices
      .map((i) => lastSuggestions?.[i]?.headline)
      .filter(Boolean)
      .join("\n- ");

    const profile = await getActiveProfile();
    const guidelines = await loadGuidelinesBundle();
    const draftTextHint = `
Geselecteerde eerdere koppen:
- ${selectedTexts || "(geen selectie)"}
Extra user feedback:
${parsed.feedback_text || "(geen)"}
User rewrite:
${parsed.user_revision_text || "(geen)"}
`;

    const suggestions = await generateSuggestions({
      profilePrompt: profile.prompt_markdown,
      guidelinesText: guidelines,
      draftText: draftTextHint,
      genre: session.genre,
      roundNumber,
      feedbackHistory,
    });

    const directionTags = parseDirectionTags(parsed.feedback_text);
    await admin.from("session_rounds").insert({
      session_id: sessionId,
      round_number: roundNumber,
      suggestions_json: suggestions,
      selected_indices: parsed.selected_indices,
      feedback_text: parsed.feedback_text,
      direction_tags: directionTags,
      user_revision_text: parsed.user_revision_text,
    });

    return NextResponse.json({ round_number: roundNumber, suggestions });
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
