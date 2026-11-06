import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "content", "training", "ftm_english_headlines.csv");
const OUTPUT = path.join(ROOT, "content", "training", "ftm_english_headlines_scored.csv");

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

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
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

async function scoreBatch({ apiKey, model, profile, rows, pass }) {
  const headlines = rows.map((row) => ({ id: row.article_id, headline: row.title }));
  const viewpoint = pass === "strict"
    ? "Be a demanding commissioning editor: do not give points for generic drama or unexplained cleverness."
    : "Be a generous but disciplined editor: reward vivid, memorable phrasing and controlled pizazz when the headline remains clear and non-clickbaity.";
  const systemPrompt = `
You are an English-language senior headline editor for Follow the Money.
Score headlines as standalone editorial objects. You see no article context and must not infer or judge whether a headline is factually accurate to an unseen article.
${viewpoint}

Use this existing FTM superprompt as the editorial standard:
${profile}
`;
  const userPrompt = `
Score each headline independently on a 1–10 scale using five dimensions, each scored 0, 1, or 2:
1. concrete_news: clear subject, claim, event or consequence rather than vagueness;
2. actor_action: clear actor/action, strong verb or a clear event;
3. ftm_fit: visible money, power, accountability, public interest or investigative tension where appropriate;
4. english_craft: natural English, scanability, memorability and controlled pizazz;
5. restraint: not generic clickbait, melodramatic, needlessly loaded or legally overconfident based on the wording itself.

The total_score is the sum of the five dimensions. A colon is not automatically bad: flag colon_formula only when it is a generic topic label followed by an explanatory subtitle and the first half adds little. Do not penalise a headline merely because it is witty, vivid, surprising or nuanced. Do not label a measured question as clickbait merely because it withholds the answer; reserve clickbait for false urgency, sensational overpromise or a misleading framing visible in the wording itself.

Return one object per input ID. Include short rationale and zero or more flags chosen from: colon_formula, vague, cliche, clickbait, flat, strong_pizazz, strong_actor_action.

HEADLINES:
${JSON.stringify(headlines, null, 2)}
`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "headline_scores",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              scores: {
                type: "array",
                minItems: rows.length,
                maxItems: rows.length,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    total_score: { type: "integer", minimum: 1, maximum: 10 },
                    concrete_news: { type: "integer", minimum: 0, maximum: 2 },
                    actor_action: { type: "integer", minimum: 0, maximum: 2 },
                    ftm_fit: { type: "integer", minimum: 0, maximum: 2 },
                    english_craft: { type: "integer", minimum: 0, maximum: 2 },
                    restraint: { type: "integer", minimum: 0, maximum: 2 },
                    flags: { type: "array", items: { type: "string" } },
                    rationale: { type: "string" },
                  },
                  required: ["id", "total_score", "concrete_news", "actor_action", "ftm_fit", "english_craft", "restraint", "flags", "rationale"],
                },
              },
            },
            required: ["scores"],
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
  const result = JSON.parse(extractOutputText(await response.json()));
  if (!Array.isArray(result.scores) || result.scores.length !== rows.length) {
    throw new Error(`Expected ${rows.length} scores, received ${result.scores?.length ?? 0}`);
  }
  return result.scores;
}

async function main() {
  await loadDotEnvFile(path.join(ROOT, ".env.local"));
  await loadDotEnvFile(path.join(ROOT, ".env"));
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const model = process.env.HEADLINE_SCORING_MODEL || process.env.BUILD_PROFILE_MODEL || "gpt-5.5";
  const pointer = JSON.parse(await readFile(path.join(ROOT, "prompt_profiles", "current_profile.json"), "utf8"));
  const profile = await readFile(path.join(ROOT, "prompt_profiles", `${pointer.profile_id}.md`), "utf8");
  const rows = parseCsv(await readFile(INPUT, "utf8"));
  if (!rows.length) throw new Error("No headlines found");

  const allScores = { strict: new Map(), generous: new Map() };
  for (const pass of ["strict", "generous"]) {
    for (let start = 0; start < rows.length; start += 20) {
      const batch = rows.slice(start, start + 20);
      const scores = await scoreBatch({ apiKey, model, profile, rows: batch, pass });
      for (const score of scores) allScores[pass].set(score.id, score);
      console.log(`${pass}: ${Math.min(start + batch.length, rows.length)}/${rows.length}`);
    }
  }

  const headers = [
    "article_id", "published_at", "article_type", "title", "url", "strict_score", "generous_score", "final_score",
    "score_disagreement", "needs_human_review", "flags", "strict_rationale", "generous_rationale",
  ];
  const output = [headers.join(",")];
  for (const row of rows) {
    const strict = allScores.strict.get(row.article_id);
    const generous = allScores.generous.get(row.article_id);
    if (!strict || !generous) throw new Error(`Missing score for ${row.article_id}`);
    const disagreement = Math.abs(strict.total_score - generous.total_score);
    const finalScore = ((strict.total_score + generous.total_score) / 2).toFixed(1);
    const flags = [...new Set([...(strict.flags ?? []), ...(generous.flags ?? [])])].join("|");
    output.push([
      row.article_id, row.published_at, row.article_type, row.title, row.url, strict.total_score, generous.total_score,
      finalScore, disagreement, disagreement > 2 ? "true" : "false", flags, strict.rationale, generous.rationale,
    ].map(csvEscape).join(","));
  }
  await writeFile(OUTPUT, `${output.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT), rows: rows.length, model }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
