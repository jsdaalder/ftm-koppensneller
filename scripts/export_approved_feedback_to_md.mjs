import { writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const OUT_PATH = path.join(ROOT, "content", "docs", "approved-user-feedback.md");

async function loadDotEnvFile(fp) {
  try {
    const raw = await readFile(fp, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // ignore missing files
  }
}

function mdEscapeInline(text) {
  return String(text ?? "").replace(/`/g, "\\`");
}

function asString(v) {
  return typeof v === "string" ? v : "";
}

function extractRounds(payload) {
  if (!payload || typeof payload !== "object") return [];
  const rounds = payload.rounds;
  if (!Array.isArray(rounds)) return [];
  return rounds
    .filter((r) => r && typeof r === "object")
    .map((r) => ({
      round_number: typeof r.round_number === "number" ? r.round_number : undefined,
      selected_indices: Array.isArray(r.selected_indices) ? r.selected_indices.filter((x) => typeof x === "number") : [],
      suggestions: Array.isArray(r.suggestions_json)
        ? r.suggestions_json
        : typeof r.suggestions_json === "string"
          ? (() => {
              try {
                const parsed = JSON.parse(r.suggestions_json);
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })()
          : [],
      selected_headlines: Array.isArray(r.selected_headlines) ? r.selected_headlines.filter((x) => typeof x === "string") : [],
      feedback_text: typeof r.feedback_text === "string" ? r.feedback_text : "",
      direction_tags: Array.isArray(r.direction_tags) ? r.direction_tags.filter((x) => typeof x === "string") : [],
      user_revision_text: typeof r.user_revision_text === "string" ? r.user_revision_text : "",
    }));
}

function extractDraftSummary(payload) {
  if (!payload || typeof payload !== "object") return "";
  const session = payload.session;
  if (!session || typeof session !== "object") return "";
  return typeof session.draft_summary === "string" ? session.draft_summary : "";
}

async function main() {
  // When invoked via `node`, Next.js doesn't auto-load env files.
  await loadDotEnvFile(path.join(ROOT, ".env.local"));
  await loadDotEnvFile(path.join(ROOT, ".env"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: submissions, error } = await sb
    .from("feedback_submissions")
    .select("id,session_id,user_id,status,payload_json,review_notes,created_at,reviewed_at")
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw error;

  const rows = submissions ?? [];
  const uniqueUserIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
  const emailByUserId = new Map();
  await Promise.all(
    uniqueUserIds.map(async (id) => {
      try {
        const { data: userData, error: userErr } = await sb.auth.admin.getUserById(id);
        if (userErr || !userData?.user?.email) return;
        emailByUserId.set(id, userData.user.email);
      } catch {
        // best effort
      }
    }),
  );

  const lines = [];
  lines.push("# Approved User Feedback (FTM Koppensneller)");
  lines.push("");
  lines.push(`Generated at: \`${new Date().toISOString()}\``);
  lines.push(`Source count: \`${rows.length}\``);
  lines.push("");
  lines.push("This document is generated from approved submissions. Treat it as training material.");
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const item of rows) {
    const userEmail = emailByUserId.get(item.user_id) ?? "-";
    lines.push(`## Submission ${item.id}`);
    lines.push("");
    lines.push(`- Status: \`${mdEscapeInline(item.status)}\``);
    lines.push(`- User: \`${mdEscapeInline(userEmail)}\``);
    lines.push(`- Created: \`${mdEscapeInline(item.created_at)}\``);
    if (item.reviewed_at) lines.push(`- Reviewed: \`${mdEscapeInline(item.reviewed_at)}\``);
    if (item.session_id) lines.push(`- Session: \`${mdEscapeInline(item.session_id)}\``);
    lines.push("");

    if (item.review_notes && String(item.review_notes).trim()) {
      lines.push("### Review notes");
      lines.push("");
      lines.push(String(item.review_notes).trim());
      lines.push("");
    }

    const draftSummary = extractDraftSummary(item.payload_json);
    if (String(draftSummary || "").trim()) {
      lines.push("### Draft summary");
      lines.push("");
      lines.push(String(draftSummary).trim());
      lines.push("");
    }

    const rounds = extractRounds(item.payload_json);
    if (rounds.length) {
      lines.push("### Rounds");
      lines.push("");
      for (const r of rounds) {
        lines.push(`#### Round ${String(r.round_number ?? "") || "?"}`);
        const feedback = asString(r.feedback_text).trim();
        if (feedback) {
          lines.push("");
          lines.push("Feedback:");
          lines.push("");
          lines.push(feedback);
        }
        const selected =
          (r.selected_headlines ?? []).filter(Boolean).length
            ? (r.selected_headlines ?? []).filter(Boolean)
            : (() => {
                const idx = (r.selected_indices ?? []).filter((n) => Number.isFinite(n));
                const sugg = (r.suggestions ?? [])
                  .map((s) => (s && typeof s === "object" && typeof s.headline === "string" ? s.headline : ""))
                  .filter(Boolean);
                const picked = [];
                for (const i of idx) {
                  if (typeof i === "number" && i >= 0 && i < sugg.length) picked.push(sugg[i]);
                }
                return picked;
              })();
        if (selected.length) {
          lines.push("");
          lines.push("Selected headlines:");
          lines.push("");
          for (const h of selected) lines.push(`- ${h}`);
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

  await writeFile(OUT_PATH, `${lines.join("\n").trim()}\n`, "utf8");
  console.log(JSON.stringify({ status: "ok", out_path: OUT_PATH, source_count: rows.length }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
