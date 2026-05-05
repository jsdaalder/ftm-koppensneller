import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const IN_PATH = path.join(ROOT, "content", "docs", "approved-user-feedback.md");
const OUT_PATH = path.join(ROOT, "content", "docs", "approved-user-feedback-lessons.md");

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
    // ignore
  }
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

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
      }
    }
  }
  return null;
}

async function runOpenAIText({ model, systemPrompt, userPrompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
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
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 500)}`);
  }
  const json = await res.json();
  const out = extractOutputText(json);
  if (!out) throw new Error("Missing output_text from OpenAI response.");
  return out;
}

async function main() {
  await loadDotEnvFile(path.join(ROOT, ".env.local"));
  await loadDotEnvFile(path.join(ROOT, ".env"));

  const model = process.env.DISTILL_FEEDBACK_MODEL || "gpt-5.5";
  const raw = await readUtf8(IN_PATH);
  const inputHash = sha256(raw + "::" + model);

  // No-op if unchanged
  try {
    const existing = await readUtf8(OUT_PATH);
    const m = existing.match(/Input hash:\s*`([^`]+)`/);
    if (m && m[1] === inputHash) {
      console.log(JSON.stringify({ status: "no-op", out_path: OUT_PATH, input_hash: inputHash }));
      return;
    }
  } catch {
    // ignore
  }

  const lessons = await runOpenAIText({
    model,
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
      raw,
    ].join("\n"),
  });

  const header = [
    "# Approved User Feedback (Lessons)",
    "",
    `Generated at: \`${new Date().toISOString()}\``,
    `Model: \`${model}\``,
    `Input hash: \`${inputHash}\``,
    "",
    "---",
    "",
  ].join("\n");

  await writeFile(OUT_PATH, `${header}${lessons.trim()}\n`, "utf8");
  console.log(JSON.stringify({ status: "built", out_path: OUT_PATH, input_hash: inputHash }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

