import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runOpenAIText } from "@/lib/server/openai";

type DigestRunResult = {
  status: "built" | "no-op";
  period_start: string;
  period_end: string;
  digest_id?: string;
};

function csv(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function toDateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getPeriod(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { periodStart: toDateOnlyUtc(start), periodEnd: toDateOnlyUtc(end) };
}

function extractFeedbackText(payload: Record<string, unknown>): string[] {
  const rounds = payload.rounds;
  if (!Array.isArray(rounds)) return [];
  const out: string[] = [];
  for (const round of rounds) {
    if (!round || typeof round !== "object") continue;
    const r = round as Record<string, unknown>;
    const feedback = typeof r.feedback_text === "string" ? r.feedback_text.trim() : "";
    if (feedback) out.push(feedback);
    const tags = Array.isArray(r.direction_tags) ? r.direction_tags.filter((x) => typeof x === "string") : [];
    if (tags.length) out.push(`Tags: ${(tags as string[]).join(", ")}`);
  }
  return out;
}

async function sendDigestEmail(args: { to: string[]; markdown: string; periodStart: string; periodEnd: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("MISSING_RESEND_API_KEY");
  const rawFrom = (process.env.FTM_VERIFICATION_FROM_EMAIL || "").trim();
  const fallbackFrom = "noreply@send.mail.example.com";
  const match = rawFrom.match(/<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>/);
  const normalizedFrom = match ? match[1] : rawFrom;
  const from = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedFrom) ? normalizedFrom : fallbackFrom;
  const subject = `FTM Koppensneller wekelijkse feedbacksamenvatting (${args.periodStart} t/m ${args.periodEnd})`;
  const text = args.markdown;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: args.to,
      subject,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DIGEST_EMAIL_FAILED_${res.status}:${body}`);
  }
}

export async function runWeeklyFeedbackDigest(opts?: { force?: boolean }): Promise<DigestRunResult> {
  const force = Boolean(opts?.force);
  const { periodStart, periodEnd } = getPeriod();
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("weekly_feedback_digests")
    .select("id")
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();
  if (existing && !force) {
    return { status: "no-op", period_start: periodStart, period_end: periodEnd, digest_id: existing.id };
  }

  const { data: submissions, error } = await admin
    .from("feedback_submissions")
    .select("id,session_id,user_id,created_at,payload_json,status")
    .gte("created_at", `${periodStart}T00:00:00.000Z`)
    .lt("created_at", `${periodEnd}T00:00:00.000Z`)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const lines: string[] = [];
  for (const row of submissions ?? []) {
    const payload = (row.payload_json || {}) as Record<string, unknown>;
    const extracted = extractFeedbackText(payload);
    if (extracted.length === 0) continue;
    lines.push(`Submission ${row.id} (${row.status}):`);
    lines.push(...extracted.map((x) => `- ${x}`));
  }
  const sourceText = lines.join("\n").slice(0, 120_000);

  const model = process.env.DIGEST_MODEL || "gpt-4.1";
  const summaryMarkdown = await runOpenAIText({
    model,
    systemPrompt:
      "Je bent een redactie-analist voor Follow the Money. Vat wekelijkse feedback samen in helder Nederlands met concrete, toepasbare aanbevelingen.",
    userPrompt: `
Periode: ${periodStart} t/m ${periodEnd}
Aantal submissions: ${(submissions ?? []).length}

Bronfeedback:
${sourceText || "(geen feedback in deze periode)"}

Maak output in markdown met:
1) Kernpatronen (max 5)
2) Wat werkt goed in koppen
3) Waar koppen misgaan
4) Concrete prompt-aanpassingen (max 10 bullets)
5) Open vragen voor de creator
`,
  });

  const recipients = csv(process.env.WEEKLY_DIGEST_RECIPIENTS);
  const rowPayload = {
    period_start: periodStart,
    period_end: periodEnd,
    generated_at: new Date().toISOString(),
    model,
    source_counts: {
      feedback_submissions: (submissions ?? []).length,
    },
    summary_markdown: summaryMarkdown,
    email_to: recipients,
    email_status: "pending",
    email_error: null,
  };

  const { data: upserted, error: upsertError } = await admin
    .from("weekly_feedback_digests")
    .upsert(rowPayload, { onConflict: "period_start,period_end" })
    .select("id")
    .single();
  if (upsertError) throw upsertError;

  try {
    if (recipients.length > 0) {
      await sendDigestEmail({
        to: recipients,
        markdown: summaryMarkdown,
        periodStart,
        periodEnd,
      });
    }
    await admin
      .from("weekly_feedback_digests")
      .update({ email_status: "sent", email_error: null })
      .eq("id", upserted.id);
  } catch (err) {
    await admin
      .from("weekly_feedback_digests")
      .update({ email_status: "failed", email_error: err instanceof Error ? err.message : "unknown error" })
      .eq("id", upserted.id);
    throw err;
  }

  return { status: "built", period_start: periodStart, period_end: periodEnd, digest_id: upserted.id };
}
