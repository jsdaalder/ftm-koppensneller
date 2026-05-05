import fs from "node:fs/promises";
import path from "node:path";
import { Suggestion } from "@/lib/types";
import { runOpenAIJson } from "@/lib/server/openai";

const AVENUES = ["impact", "accountability", "data-first"] as const;

async function readGuidelineDir(dirPath: string): Promise<string> {
  try {
    const names = await fs.readdir(dirPath);
    const chunks: string[] = [];
    for (const name of names) {
      const filePath = path.join(dirPath, name);
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        chunks.push(await fs.readFile(filePath, "utf-8"));
      }
    }
    return chunks.join("\n\n");
  } catch {
    return "";
  }
}

export async function loadGuidelinesBundle(): Promise<string> {
  const base = process.env.GUIDELINES_DIR
    ? path.resolve(process.env.GUIDELINES_DIR)
    : path.resolve(process.cwd(), "..", "guidelines");
  const [ftm, generic, extra] = await Promise.all([
    readGuidelineDir(path.join(base, "ftm_styleguide")),
    readGuidelineDir(path.join(base, "generic_headline_guides")),
    readGuidelineDir(path.join(base, "extra_docs")),
  ]);
  return [ftm, generic, extra].filter(Boolean).join("\n\n");
}

function enforceAvenueDistribution(suggestions: Suggestion[]): Suggestion[] {
  const buckets: Record<string, Suggestion[]> = { impact: [], accountability: [], "data-first": [] };
  for (const s of suggestions) {
    if (buckets[s.avenue]) buckets[s.avenue].push(s);
  }
  const out: Suggestion[] = [];
  for (const avenue of AVENUES) {
    out.push(...buckets[avenue].slice(0, 3));
  }
  if (out.length >= 9) return out.slice(0, 9);
  const flat = [...suggestions];
  while (out.length < 9 && flat.length) {
    const nxt = flat.shift()!;
    if (!out.find((x) => x.headline === nxt.headline)) out.push(nxt);
  }
  return out.slice(0, 9);
}

function compliancePass(suggestions: Suggestion[]): Suggestion[] {
  return suggestions.map((s) => {
    const cleaned = s.headline.replace(/\s+/g, " ").trim();
    const softened = cleaned.replace(/\bfraude\b/gi, "mogelijke fraude");
    return { ...s, headline: softened };
  });
}

export async function generateSuggestions(args: {
  profilePrompt: string;
  guidelinesText: string;
  draftText: string;
  genre: string;
  roundNumber: number;
  feedbackHistory: string;
}): Promise<Suggestion[]> {
  const model = process.env.HEADLINE_MODEL || "gpt-4.1";
  const systemPrompt = `
Je bent FTM Headline Coach. Output ALTIJD Nederlands.
Geef exact 9 koppen. Voor ronde 1: precies 3x impact, 3x accountability, 3x data-first.
Houd rekening met stijlregels en juridische voorzichtigheid.
`;
  const userPrompt = `
ACTIEF PROFIEL:
${args.profilePrompt}

RICHTLIJNEN:
${args.guidelinesText}

GENRE: ${args.genre}
RONDE: ${args.roundNumber}
FEEDBACKHISTORIE:
${args.feedbackHistory || "(geen)"}

CONCEPTTEKST:
${args.draftText}
`;

  const payload = await runOpenAIJson<{ suggestions: Suggestion[] }>({
    model,
    systemPrompt,
    userPrompt,
  });
  const compliant = compliancePass(payload.suggestions);
  return enforceAvenueDistribution(compliant);
}
