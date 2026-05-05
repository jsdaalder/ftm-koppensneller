import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const IN_PATH = path.join(ROOT, "content", "docs", "ftm-stijlgids.md");
const OUT_PATH = path.join(ROOT, "content", "docs", "ftm-stijlgids-condensed.md");

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

  const model = process.env.CONDENSE_STYLEGUIDE_MODEL || "gpt-5.5";
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

  const condensed = await runOpenAIText({
    model,
    systemPrompt:
      "Je bent een eindredacteur. Je maakt een compacte, prompt-ready samenvatting van een stijlgids. Output is Nederlands.",
    userPrompt: [
      "Taak: maak een compacte versie van de FTM-stijlgids die geschikt is als input voor een headline-generator prompt.",
      "",
      "HARD LIMITS:",
      "- Max 900 woorden totaal.",
      "- Max 20 bullets onder 'Do' en max 20 bullets onder 'Don't'.",
      "- Voeg een sectie toe: 'FTM-koppen: concrete regels' (max 15 bullets).",
      "- Voeg een sectie toe: 'Taboes en risico's' (max 10 bullets).",
      "- Geen lange uitleg; alleen toepasbare regels en voorkeuren.",
      "",
      "Lever output als Markdown met duidelijke kopjes.",
      "",
      "ORIGINELE STIJLGIDS:",
      raw,
    ].join("\n"),
  });

  const header = [
    "# FTM-stijlgids (Condensed)",
    "",
    `Generated at: \`${new Date().toISOString()}\``,
    `Model: \`${model}\``,
    `Input hash: \`${inputHash}\``,
    "",
    "---",
    "",
  ].join("\n");

  await writeFile(OUT_PATH, `${header}${condensed.trim()}\n`, "utf8");
  console.log(JSON.stringify({ status: "built", out_path: OUT_PATH, input_hash: inputHash }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

