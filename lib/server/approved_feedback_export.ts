import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ApprovedSubmission = {
  id: string;
  session_id: string | null;
  user_id: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
  payload_json: unknown;
  user_email?: string | null;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function mdEscapeInline(text: string): string {
  return text.replace(/`/g, "\\`");
}

function extractRounds(payload: unknown): Array<{
  round_number?: number;
  selected_headlines?: string[];
  selected_indices?: number[];
  suggestions?: Array<{ headline?: string }>;
  feedback_text?: string;
  direction_tags?: string[];
  user_revision_text?: string;
}> {
  if (!payload || typeof payload !== "object") return [];
  const rounds = (payload as Record<string, unknown>).rounds;
  if (!Array.isArray(rounds)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const r of rounds) {
    if (r && typeof r === "object") out.push(r as Record<string, unknown>);
  }
  return out.map((r) => ({
    round_number: typeof r.round_number === "number" ? r.round_number : undefined,
    selected_indices: Array.isArray(r.selected_indices)
      ? (r.selected_indices as unknown[]).filter((x) => typeof x === "number") as number[]
      : undefined,
    suggestions: Array.isArray(r.suggestions_json)
      ? (r.suggestions_json as unknown[]).filter((x) => x && typeof x === "object") as Array<{ headline?: string }>
      : (typeof r.suggestions_json === "string"
          ? (() => {
              try {
                const parsed = JSON.parse(r.suggestions_json as string);
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })()
          : []),
    selected_headlines: Array.isArray(r.selected_headlines)
      ? (r.selected_headlines as unknown[]).filter((x) => typeof x === "string") as string[]
      : undefined,
    feedback_text: typeof r.feedback_text === "string" ? r.feedback_text : undefined,
    direction_tags: Array.isArray(r.direction_tags)
      ? (r.direction_tags as unknown[]).filter((x) => typeof x === "string") as string[]
      : undefined,
    user_revision_text: typeof r.user_revision_text === "string" ? r.user_revision_text : undefined,
  }));
}

function extractDraftSummary(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const session = (payload as Record<string, unknown>).session;
  if (!session || typeof session !== "object") return "";
  const summary = (session as Record<string, unknown>).draft_summary;
  return typeof summary === "string" ? summary : "";
}

export async function buildApprovedFeedbackMarkdown(): Promise<{
  markdown: string;
  sourceCount: number;
  lastSubmissionAt: string | null;
}> {
  const admin = createSupabaseAdminClient();
  const { data: rows, error } = await admin
    .from("feedback_submissions")
    .select("id,session_id,user_id,status,payload_json,review_notes,created_at,reviewed_at")
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw error;

  const approved = (rows ?? []) as ApprovedSubmission[];
  const uniqueUserIds = Array.from(new Set(approved.map((r) => r.user_id).filter(Boolean)));
  const emailByUserId = new Map<string, string>();
  await Promise.all(
    uniqueUserIds.map(async (id) => {
      try {
        const { data: userData, error: userErr } = await admin.auth.admin.getUserById(id);
        if (userErr || !userData?.user?.email) return;
        emailByUserId.set(id, userData.user.email);
      } catch {
        // best effort
      }
    }),
  );

  const enriched = approved.map((r) => ({ ...r, user_email: emailByUserId.get(r.user_id) ?? null }));
  const lastSubmissionAt = enriched[0]?.reviewed_at ?? enriched[0]?.created_at ?? null;

  const lines: string[] = [];
  lines.push("# Approved User Feedback (FTM Koppensneller)");
  lines.push("");
  lines.push(`Generated at: \`${new Date().toISOString()}\``);
  lines.push(`Source count: \`${enriched.length}\``);
  lines.push("");
  lines.push("This document is generated from approved submissions. Treat it as training material.");
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const item of enriched) {
    lines.push(`## Submission ${item.id}`);
    lines.push("");
    lines.push(`- Status: \`${mdEscapeInline(item.status ?? "-")}\``);
    lines.push(`- User: \`${mdEscapeInline(item.user_email ?? "-")}\``);
    lines.push(`- Created: \`${mdEscapeInline(item.created_at)}\``);
    if (item.reviewed_at) lines.push(`- Reviewed: \`${mdEscapeInline(item.reviewed_at)}\``);
    if (item.session_id) lines.push(`- Session: \`${mdEscapeInline(item.session_id)}\``);
    lines.push("");

    const draftSummary = extractDraftSummary(item.payload_json);
    if (draftSummary.trim()) {
      lines.push("### Draft summary");
      lines.push("");
      lines.push(draftSummary.trim());
      lines.push("");
    }
    if (item.review_notes && item.review_notes.trim()) {
      lines.push("### Review notes");
      lines.push("");
      lines.push(item.review_notes.trim());
      lines.push("");
    }
    const rounds = extractRounds(item.payload_json);
    if (rounds.length) {
      lines.push("### Rounds");
      lines.push("");
      for (const r of rounds) {
        lines.push(`#### Round ${String(r.round_number ?? "") || "?"}`);
        const derivedSelected =
          (r.selected_headlines ?? []).filter(Boolean).length
            ? (r.selected_headlines ?? []).filter(Boolean)
            : (() => {
                const idx = (r.selected_indices ?? []).filter((n) => Number.isFinite(n));
                const sugg = (r.suggestions ?? []).map((s) => (typeof s?.headline === "string" ? s.headline : "")).filter(Boolean);
                const picked: string[] = [];
                for (const i of idx) {
                  if (typeof i === "number" && i >= 0 && i < sugg.length) picked.push(sugg[i]);
                }
                return picked;
              })();

        const feedback = asString(r.feedback_text).trim();
        if (feedback) {
          lines.push("");
          lines.push("Feedback:");
          lines.push("");
          lines.push(feedback);
        }
        if (derivedSelected.length) {
          lines.push("");
          lines.push("Selected headlines:");
          lines.push("");
          for (const h of derivedSelected) lines.push(`- ${h}`);
        }
        const tags = (r.direction_tags ?? []).filter(Boolean);
        if (tags.length) {
          lines.push("");
          lines.push(`Tags: ${tags.join(", ")}`);
        }
        const revision = asString(r.user_revision_text).trim();
        if (revision) {
          lines.push("");
          lines.push("User rewrite:");
          lines.push("");
          lines.push(revision);
        }
        lines.push("");
      }
    }
    lines.push("---");
    lines.push("");
  }

  return { markdown: lines.join("\n"), sourceCount: enriched.length, lastSubmissionAt };
}

export async function upsertApprovedFeedbackExport(): Promise<{ id: string; sourceCount: number }> {
  const { markdown, sourceCount, lastSubmissionAt } = await buildApprovedFeedbackMarkdown();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("approved_feedback_exports")
    .insert({
      markdown_text: markdown,
      source_count: sourceCount,
      last_submission_at: lastSubmissionAt,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, sourceCount };
}

export async function getLatestApprovedFeedbackExport(): Promise<{
  id: string;
  markdown_text: string;
  generated_at: string;
  source_count: number;
} | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("approved_feedback_exports")
    .select("id,markdown_text,generated_at,source_count")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as any) ?? null;
}
