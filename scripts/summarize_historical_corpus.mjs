import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const TRAINING_DIR = path.join(ROOT, "content", "training");
const JSONL_PATH = path.join(TRAINING_DIR, "ftm_headline_training.jsonl");

const PROPOSED_JSON_PATH = path.join(TRAINING_DIR, "historical-corpus-insights.proposed.json");
const PROPOSED_MD_PATH = path.join(TRAINING_DIR, "historical-corpus-insights.proposed.md");
const FINAL_MD_PATH = path.join(TRAINING_DIR, "historical-corpus-insights.md");

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

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function clamp(text, maxChars) {
  const t = String(text ?? "");
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}…`;
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

async function runOpenAIJson({ model, systemPrompt, userPrompt, schema }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const body = {
    model,
    input: [
      { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
      { role: "user", content: [{ type: "input_text", text: userPrompt }] },
    ],
    // Structured Outputs: Responses API uses `text.format`.
    // Docs: https://platform.openai.com/docs/api-reference/responses/create
    text: {
      format: {
        type: "json_schema",
        name: "historical_corpus_insights",
        schema,
        strict: true,
      },
    },
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 500)}`);
  }
  const json = await res.json();

  // `output_text` is present for many responses, but not guaranteed.
  // Structured Outputs still arrive as text in the output message content.
  const candidateTexts = [];
  if (typeof json.output_text === "string") candidateTexts.push(json.output_text);
  if (Array.isArray(json.output)) {
    for (const item of json.output) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        const t = c?.text;
        if (typeof t === "string") candidateTexts.push(t);
      }
    }
  }
  const out = candidateTexts.find((t) => typeof t === "string" && t.trim());
  if (!out) throw new Error("Missing output_text from OpenAI response.");
  return JSON.parse(out);
}

function buildFinalMd({ analysis_markdown, representative_examples, meta }) {
  const lines = [];
  lines.push("# Historical Corpus Insights (FTM Koppensneller)");
  lines.push("");
  lines.push(`Generated at: \`${meta.generated_at}\``);
  lines.push(`Model: \`${meta.model}\``);
  lines.push(`Corpus hash: \`${meta.corpus_hash}\``);
  lines.push("");
  lines.push("This document is generated from the historical headline corpus. It is used as training input when building the super-prompt profile.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Findings and Patterns");
  lines.push("");
  lines.push(String(analysis_markdown || "").trim());
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Representative Examples (Approved Set)");
  lines.push("");
  for (const ex of representative_examples ?? []) {
    lines.push(`### ${ex.id}`);
    lines.push("");
    lines.push(`**Headline:** ${ex.headline}`);
    if (ex.genre) {
      lines.push("");
      lines.push(`**Genre:** ${ex.genre}`);
    }
    if (ex.rationale) {
      lines.push("");
      lines.push(`**Why this is representative:** ${ex.rationale}`);
    }
    if (Array.isArray(ex.patterns) && ex.patterns.length) {
      lines.push("");
      lines.push(`**Patterns:** ${ex.patterns.join(", ")}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

async function propose() {
  await mkdir(TRAINING_DIR, { recursive: true });
  const raw = await readUtf8(JSONL_PATH);
  const corpusHash = sha256(raw);
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const records = lines.map(parseJsonLine).filter(Boolean);

  const compact = records.map((r) => ({
    id: String(r.id ?? ""),
    headline: String(r.headline ?? "").trim(),
    lead: clamp(String(r.lead ?? "").trim(), 500),
    tags: Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === "string").slice(0, 12) : [],
  }));

  const model = process.env.BUILD_CORPUS_INSIGHTS_MODEL || "gpt-5.5";
  const systemPrompt =
    "Je bent een extreem kritische headline-editor voor Follow the Money. Je analyseert een historische koppen-corpus en formuleert concrete, bruikbare patronen. Output is in het Nederlands.";

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      analysis_markdown: { type: "string" },
      proposed_examples: {
        type: "array",
        minItems: 20,
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            headline: { type: "string" },
            rationale: { type: "string" },
            patterns: { type: "array", items: { type: "string" } },
          },
          required: ["id", "headline", "rationale", "patterns"],
        },
      },
    },
    required: ["analysis_markdown", "proposed_examples"],
  };

  const userPrompt = [
    "Analyseer de historische FTM-koppen corpus hieronder. Lever twee outputs in JSON volgens schema:",
    "1) analysis_markdown: een gestructureerde analyse (koppenvormen, lengte, cijfers, actoren, werkwoorden, framing, taboes, valkuilen). Wees concreet en voeg voorbeelden toe als citaten (korte fragmenten).",
    "2) proposed_examples: kies exact 20 representatieve voorbeelden uit de corpus (diversiteit in vormen). Geef per keuze rationale + pattern-tags.",
    "",
    "HARD LIMITS (belangrijk):",
    "- analysis_markdown max 900-1200 woorden totaal.",
    "- Gebruik maximaal 12 bullets onder 'Praktische regels' (als je bullets gebruikt).",
    "- Geen lange inleiding; ga direct naar patronen en regels.",
    "",
    "CORPUS (id, headline, lead (truncated), tags):",
    JSON.stringify({ count: compact.length, records: compact }, null, 2),
  ].join("\n\n");

  const result = await runOpenAIJson({ model, systemPrompt, userPrompt, schema });
  const proposed = {
    meta: { generated_at: new Date().toISOString(), model, corpus_hash: corpusHash, record_count: compact.length },
    analysis_markdown: String(result.analysis_markdown || ""),
    proposed_examples: result.proposed_examples,
  };

  await writeFile(PROPOSED_JSON_PATH, JSON.stringify(proposed, null, 2), "utf8");
  await writeFile(
    PROPOSED_MD_PATH,
    buildFinalMd({
      analysis_markdown: proposed.analysis_markdown,
      representative_examples: proposed.proposed_examples,
      meta: proposed.meta,
    }),
    "utf8",
  );

  console.log(
    JSON.stringify({
      status: "proposed",
      proposed_json: PROPOSED_JSON_PATH,
      proposed_md: PROPOSED_MD_PATH,
      record_count: compact.length,
    }),
  );
}

async function addGenres() {
  const proposed = JSON.parse(await readUtf8(PROPOSED_JSON_PATH));
  const raw = await readUtf8(JSONL_PATH);
  const byId = new Map();
  for (const line of raw.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const rec = parseJsonLine(line);
    if (!rec?.id) continue;
    byId.set(String(rec.id), rec);
  }

  const examples = (proposed.proposed_examples ?? []).map((ex) => {
    const full = byId.get(ex.id) ?? {};
    return {
      id: ex.id,
      headline: ex.headline,
      lead: clamp(String(full.lead ?? ""), 800),
      tags: Array.isArray(full.tags) ? full.tags.filter((t) => typeof t === "string").slice(0, 12) : [],
    };
  });

  const model = process.env.BUILD_CORPUS_INSIGHTS_MODEL || "gpt-5.5";
  const genres = ["nieuws", "onderzoek", "analyse", "reportage", "interview", "podcast", "essay"];
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        minItems: examples.length,
        maxItems: examples.length,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            genre: { type: "string", enum: genres },
            reason: { type: "string" },
          },
          required: ["id", "genre", "reason"],
        },
      },
    },
    required: ["items"],
  };

  const systemPrompt =
    "Je bent een ervaren eindredacteur. Classificeer de genre van het stuk op basis van kop, lead en context. Kies strikt uit de toegestane genres. Output is Nederlands.";
  const userPrompt = [
    "Voor elk item hieronder: kies precies 1 genre uit deze lijst:",
    genres.join(", "),
    "",
    "Regels:",
    "- Kies altijd exact 1 genre uit de lijst (geen andere woorden).",
    "- 'feature' heet hier 'reportage'.",
    "- Als het twijfelachtig is: kies de meest waarschijnlijke op basis van de kop en lead.",
    "",
    "ITEMS:",
    JSON.stringify({ items: examples }, null, 2),
  ].join("\n");

  const result = await runOpenAIJson({ model, systemPrompt, userPrompt, schema });
  const map = new Map((result.items ?? []).map((it) => [it.id, it]));

  proposed.proposed_examples = (proposed.proposed_examples ?? []).map((ex) => {
    const hit = map.get(ex.id);
    if (!hit) return ex;
    return { ...ex, genre: hit.genre, genre_reason: hit.reason };
  });

  await writeFile(PROPOSED_JSON_PATH, JSON.stringify(proposed, null, 2), "utf8");
  await writeFile(
    PROPOSED_MD_PATH,
    buildFinalMd({
      analysis_markdown: proposed.analysis_markdown,
      representative_examples: proposed.proposed_examples,
      meta: proposed.meta,
    }),
    "utf8",
  );

  console.log(JSON.stringify({ status: "genres_added", proposed_json: PROPOSED_JSON_PATH, proposed_md: PROPOSED_MD_PATH }));
}

async function approve() {
  const proposed = JSON.parse(await readUtf8(PROPOSED_JSON_PATH));
  const meta = proposed.meta ?? { generated_at: new Date().toISOString(), model: "unknown", corpus_hash: "unknown" };

  const finalMd = buildFinalMd({
    analysis_markdown: proposed.analysis_markdown,
    representative_examples: proposed.proposed_examples,
    meta,
  });
  await writeFile(FINAL_MD_PATH, finalMd, "utf8");
  console.log(JSON.stringify({ status: "approved_written", final_md: FINAL_MD_PATH, proposed_json: PROPOSED_JSON_PATH }));
}

async function main() {
  await loadDotEnvFile(path.join(ROOT, ".env.local"));
  await loadDotEnvFile(path.join(ROOT, ".env"));

  const cmd = process.argv[2] || "propose";
  if (cmd === "propose") return propose();
  if (cmd === "add-genres") return addGenres();
  if (cmd === "approve") return approve();
  throw new Error("Usage: node scripts/summarize_historical_corpus.mjs propose|add-genres|approve");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
