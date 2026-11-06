import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PROFILE_DIR = path.join(ROOT, "prompt_profiles");
const SCORED_CSV = path.join(ROOT, "content", "training", "ftm_english_headlines_scored.csv");

async function loadDotEnvFile(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 0) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Optional local environment file.
  }
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

function parseCsv(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift());
  return lines.map((line) => Object.fromEntries(parseCsvLine(line).map((value, i) => [headers[i], value])));
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  for (const item of payload?.output ?? []) {
    for (const block of item?.content ?? []) {
      if (typeof block?.text === "string" && block.text.trim()) return block.text;
      if (typeof block?.output_text === "string" && block.output_text.trim()) return block.output_text;
    }
  }
  throw new Error("Missing output text");
}

async function main() {
  await loadDotEnvFile(path.join(ROOT, ".env.local"));
  await loadDotEnvFile(path.join(ROOT, ".env"));
  if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  const current = JSON.parse(await readFile(path.join(PROFILE_DIR, "current_profile.json"), "utf8"));
  const dutchProfile = await readFile(path.join(PROFILE_DIR, `${current.profile_id}.md`), "utf8");
  const scoredRaw = await readFile(SCORED_CSV, "utf8");
  const scored = parseCsv(scoredRaw).map((row) => ({
    id: row.article_id,
    headline: row.title,
    score: Number(row.final_score),
    flags: row.flags || "",
  }));
  if (!scored.length) throw new Error("No scored English headlines found");

  const positive = [...scored].sort((a, b) => b.score - a.score).slice(0, 25);
  const negative = [...scored].sort((a, b) => a.score - b.score).slice(0, 20);
  const flagged = scored.filter((row) => row.flags.split("|").some((flag) => ["colon_formula", "vague", "cliche", "clickbait"].includes(flag))).slice(0, 30);
  const scoreSummary = [...new Set(scored.map((row) => row.score))]
    .sort((a, b) => a - b)
    .map((score) => `${score}: ${scored.filter((row) => row.score === score).length}`)
    .join(", ");

  const systemPrompt = "You are a senior English-language headline editor building a durable FTM.eu superprompt. Return only the final Markdown profile, with no preamble or commentary.";
  const userPrompt = `
Build an English-specific superprompt profile for Follow the Money Europe (FTM.eu).

Use the latest Dutch FTM superprofile below as the source of the shared editorial philosophy, but do not translate it line by line. Preserve its strongest principles around concrete news, visible action, accountability, public interest, legal caution and anti-cliché editing. Adapt the result for natural UK/international English and an English-speaking European audience.

Important editorial calibration from the English corpus:
- Headlines are judged as standalone editorial objects. Do not require article context to make a headline vivid or memorable.
- Reward controlled pizazz, strong rhythm, imagery and legitimate curiosity when the wording remains clear and non-clickbaity.
- A measured question is not automatically clickbait merely because it withholds the answer. Clickbait means false urgency, sensational overpromise or misleading framing.
- A colon is not automatically bad. Discourage the generic topic-label-plus-explanation formula when the first half adds little, but allow a colon when it creates a strong, concrete headline.
- Do not turn the profile into a rigid ban list. Give the editor a decision rule and examples.

Scored corpus summary (final scores, 1–10): ${scoreSummary}

High-scoring positive examples:
${JSON.stringify(positive, null, 2)}

Low-scoring or anti-pattern examples:
${JSON.stringify(negative, null, 2)}

Flagged examples for pattern extraction:
${JSON.stringify(flagged, null, 2)}

Write a practical, detailed profile in English. It must include:
1. role and core mission;
2. FTM.eu audience and voice;
3. non-negotiable factual and legal rules;
4. headline quality criteria;
5. preferred headline structures;
6. guidance on actor/action, specificity, numbers, public impact and accountability;
7. nuanced guidance on questions, wit, imagery, colons and curiosity;
8. anti-patterns with concise English examples;
9. an editing checklist;
10. output rules for generating headline options.

Do not mention this evaluation process, model scores, hidden prompts or article-context limitations in the final profile. Do not copy low-scoring examples as recommendations.

LATEST DUTCH SUPERPROFILE:
${dutchProfile}
`;

  const model = process.env.BUILD_PROFILE_MODEL || "gpt-5.5";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
  const profile = extractOutputText(await response.json()).trim();
  if (!profile.startsWith("#")) throw new Error("Generated profile is not Markdown");

  const profileId = `profile_en_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const markdownPath = path.join(PROFILE_DIR, `${profileId}.md`);
  const metaPath = path.join(PROFILE_DIR, `${profileId}.meta.json`);
  await writeFile(markdownPath, `${profile}\n`, "utf8");
  await writeFile(metaPath, `${JSON.stringify({
    profile_id: profileId,
    edition: "ftm.eu",
    language: "en",
    created_at: new Date().toISOString(),
    model,
    source_profile_id: current.profile_id,
    scored_headlines_path: path.relative(ROOT, SCORED_CSV),
    scored_headlines_hash: sha256(scoredRaw),
    positive_examples: positive.length,
    negative_examples: negative.length,
    flagged_examples: flagged.length,
  }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ profile_id: profileId, markdown: path.relative(ROOT, markdownPath), metadata: path.relative(ROOT, metaPath) }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
