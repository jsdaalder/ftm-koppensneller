import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const DOCS_DIR = path.join(ROOT, "content", "docs");
const TRAINING_JSONL = path.join(ROOT, "content", "training", "ftm_headline_training.jsonl");
const CORPUS_INSIGHTS_MD = path.join(ROOT, "content", "training", "historical-corpus-insights.md");
const CONDENSED_STYLEGUIDE = path.join(DOCS_DIR, "ftm-stijlgids-condensed.md");
const APPROVED_FEEDBACK_LESSONS = path.join(DOCS_DIR, "approved-user-feedback-lessons.md");
const PROFILES_DIR = path.join(ROOT, "prompt_profiles");

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function readUtf8(fp) {
  return (await readFile(fp, "utf8")).toString();
}

async function loadDotEnvFile(fp) {
  try {
    const raw = await readUtf8(fp);
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

function nowId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

async function getLatestApprovedExportMarkdown() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await sb
    .from("approved_feedback_exports")
    .select("id,markdown_text,generated_at,source_count")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function getLatestApprovedLessonsMarkdown() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await sb
    .from("approved_feedback_lessons_exports")
    .select("id,markdown_text,generated_at,source_export_id,source_hash,source_count")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function runOpenAIText({ model, systemPrompt, userPrompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  function extractOutputText(payload) {
    if (!payload || typeof payload !== "object") return null;
    if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
    if (Array.isArray(payload.output)) {
      for (const item of payload.output) {
        if (!item || typeof item !== "object") continue;
        const content = item.content;
        if (!Array.isArray(content)) continue;
        for (const c of content) {
          if (c && typeof c.text === "string" && c.text.trim()) return c.text;
          if (c && typeof c.output_text === "string" && c.output_text.trim()) return c.output_text;
        }
      }
    }
    return null;
  }

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const json = await res.json();
  const out = extractOutputText(json);
  if (typeof out === "string" && out.trim()) return out;
  throw new Error("Missing output_text");
}

async function main() {
  // When invoked via `node`, Next.js doesn't auto-load env files.
  await loadDotEnvFile(path.join(ROOT, ".env.local"));
  await loadDotEnvFile(path.join(ROOT, ".env"));

  const model = process.env.BUILD_PROFILE_MODEL || "gpt-5.5";

  const sources = [
    ["ftm-stijlgids-condensed", CONDENSED_STYLEGUIDE],
    ["comite-cliche-weg-ermee", path.join(DOCS_DIR, "comite-cliche-weg-ermee.md")],
    ["ftm-koppenchecklist", path.join(DOCS_DIR, "ftm-koppenchecklist.md")],
    ["historical_corpus_insights", CORPUS_INSIGHTS_MD],
    ["approved_feedback_lessons", APPROVED_FEEDBACK_LESSONS],
  ];

  const docsContent = {};
  for (const [k, fp] of sources) {
    docsContent[k] = await readUtf8(fp);
  }
  const exportRow = await getLatestApprovedExportMarkdown();
  const approvedFeedbackRaw =
    exportRow?.markdown_text ?? (await readUtf8(path.join(DOCS_DIR, "approved-user-feedback.md")).catch(() => ""));
  const lessonsRow = await getLatestApprovedLessonsMarkdown();
  const approvedFeedbackLessons =
    lessonsRow?.markdown_text ?? (await readUtf8(APPROVED_FEEDBACK_LESSONS).catch(() => ""));

  const trainingJsonlRaw = await readUtf8(TRAINING_JSONL).catch(() => "");
  const inputHash = sha256(
    JSON.stringify({
      model,
      docs: Object.fromEntries(Object.entries(docsContent).map(([k, v]) => [k, sha256(v)])),
      approved_raw: sha256(approvedFeedbackRaw),
      approved_lessons: sha256(approvedFeedbackLessons),
      training_jsonl: sha256(trainingJsonlRaw),
    }),
  );

  const pointerPath = path.join(PROFILES_DIR, "current_profile.json");
  let existingHash = null;
  try {
    const pointer = JSON.parse(await readUtf8(pointerPath));
    const meta = JSON.parse(await readUtf8(pointer.meta_path));
    existingHash = meta?.input_hash ?? null;
  } catch {}

  if (existingHash && existingHash === inputHash && process.argv.includes("--force") === false) {
    console.log(JSON.stringify({ status: "no-op", reason: "inputs unchanged", input_hash: inputHash }));
    return;
  }

  const systemPrompt =
    "Je bent een senior headline-editor voor Follow the Money. Je schrijft een herbruikbaar, uitgebreid superpromptprofiel in het Nederlands.";
  const userPrompt = [
    "Je bouwt een nieuw promptprofiel. Gebruik alleen deze bronnen:",
    "",
    "TRAINING SOURCES USED (verbatim list):",
    "- FTM-stijlgids (condensed)",
    "- Comite Cliche Weg Ermee",
    "- FTM Koppenchecklist",
    "- Historische corpus insights (samenvatting + 20 representatieve voorbeelden)",
    "- Approved user feedback (lessons distilled)",
    "- Approved user feedback",
    "",
    "BRON 1: FTM-stijlgids (condensed)",
    docsContent["ftm-stijlgids-condensed"],
    "",
    "BRON 2: Comite Cliche Weg Ermee",
    docsContent["comite-cliche-weg-ermee"],
    "",
    "BRON 3: FTM Koppenchecklist",
    docsContent["ftm-koppenchecklist"],
    "",
    "BRON 4: Historische corpus insights",
    docsContent["historical_corpus_insights"],
    "",
    "BRON 5: Approved user feedback (lessons distilled)",
    docsContent["approved_feedback_lessons"],
    "",
    "BRON 6: Approved user feedback (raw, for audit)",
    approvedFeedbackRaw,
    "",
    "Lever alleen markdown op voor het superpromptprofiel. Geen uitleg erbuiten.",
  ].join("\n\n");

  const promptMarkdown = await runOpenAIText({ model, systemPrompt, userPrompt });

  const profileId = `profile_${nowId()}`;
  const mdPath = path.join(PROFILES_DIR, `${profileId}.md`);
  const metaPath = path.join(PROFILES_DIR, `${profileId}.meta.json`);

  await writeFile(mdPath, promptMarkdown, "utf8");
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        profile_id: profileId,
        created_at: new Date().toISOString(),
        model,
        input_hash: inputHash,
        approved_export_id: exportRow?.id ?? null,
        training_jsonl_hash: sha256(trainingJsonlRaw),
        sources: sources.map(([k, fp]) => ({ key: k, path: fp.replace(ROOT + path.sep, "") })),
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    pointerPath,
    JSON.stringify({ profile_id: profileId, md_path: mdPath, meta_path: metaPath }, null, 2),
    "utf8",
  );

  console.log(JSON.stringify({ status: "built", profile_id: profileId, md_path: mdPath, meta_path: metaPath }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
