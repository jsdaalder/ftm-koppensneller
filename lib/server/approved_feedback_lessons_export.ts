import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runOpenAIText } from "@/lib/server/openai";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function getLatestApprovedFeedbackLessonsExport(): Promise<{
  id: string;
  markdown_text: string;
  generated_at: string;
  source_export_id: string | null;
  source_hash: string | null;
  source_count: number;
} | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("approved_feedback_lessons_exports")
    .select("id,markdown_text,generated_at,source_export_id,source_hash,source_count")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as any) ?? null;
}

async function getLatestRawExport(): Promise<{
  id: string;
  markdown_text: string;
  source_count: number;
  last_submission_at: string | null;
} | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("approved_feedback_exports")
    .select("id,markdown_text,source_count,last_submission_at")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as any) ?? null;
}

function wrapLessonsMarkdown(params: {
  lessonsBody: string;
  model: string;
  sourceExportId: string;
  sourceHash: string;
  sourceCount: number;
}) {
  const header = [
    "# Approved User Feedback (Lessons)",
    "",
    `Generated at: \`${new Date().toISOString()}\``,
    `Model: \`${params.model}\``,
    `Source export id: \`${params.sourceExportId}\``,
    `Source hash: \`${params.sourceHash}\``,
    `Source count: \`${params.sourceCount}\``,
    "",
    "---",
    "",
  ].join("\n");
  return `${header}${params.lessonsBody.trim()}\n`;
}

async function distillLessonsFromRaw(params: { rawMarkdown: string; model: string }): Promise<string> {
  const lessons = await runOpenAIText({
    model: params.model,
    systemPrompt:
      "Je bent een eindredacteur. Je destilleert user feedback naar korte, herbruikbare headline-regels. Output is Nederlands.",
    userPrompt: [
      "Taak: destilleer de goedgekeurde user feedback hieronder naar een compacte set toepasbare regels voor de koppen-generator.",
      "",
      "HARD LIMITS:",
      "- Max 600 woorden totaal.",
      "- Output structuur:",
      "  1) 'Top lessons' (max 10 bullets)",
      "  2) 'Anti-patterns to avoid' (max 10 bullets)",
      "  3) 'Safety + hallucination guardrails' (max 8 bullets)",
      "- Gebruik korte, duidelijke zinnen.",
      "- Geen persoonsnamen; focus op regels.",
      "",
      "GOEDGEKEURDE FEEDBACK (RAW):",
      params.rawMarkdown,
    ].join("\n"),
    timeoutMs: Number(process.env.DISTILL_FEEDBACK_TIMEOUT_MS || 60000),
  });
  return lessons;
}

export async function exportApprovedFeedbackLessons(params?: {
  force?: boolean;
}): Promise<
  | { status: "no-op"; reason: string; source_export_id: string }
  | { status: "built"; id: string; source_export_id: string; source_count: number }
> {
  const raw = await getLatestRawExport();
  if (!raw) {
    return { status: "no-op", reason: "no_raw_export", source_export_id: "-" };
  }

  const sourceHash = sha256(raw.markdown_text);
  const latest = await getLatestApprovedFeedbackLessonsExport();
  if (!params?.force && latest?.source_hash && latest.source_hash === sourceHash) {
    return { status: "no-op", reason: "unchanged", source_export_id: raw.id };
  }

  const model = process.env.DISTILL_FEEDBACK_MODEL || "gpt-5.5";
  const lessonsBody = await distillLessonsFromRaw({ rawMarkdown: raw.markdown_text, model });
  const markdown = wrapLessonsMarkdown({
    lessonsBody,
    model,
    sourceExportId: raw.id,
    sourceHash,
    sourceCount: raw.source_count ?? 0,
  });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("approved_feedback_lessons_exports")
    .insert({
      markdown_text: markdown,
      source_export_id: raw.id,
      source_hash: sourceHash,
      source_count: raw.source_count ?? 0,
      last_submission_at: raw.last_submission_at,
    })
    .select("id")
    .single();
  if (error) throw error;

  return { status: "built", id: data.id as string, source_export_id: raw.id, source_count: raw.source_count ?? 0 };
}

