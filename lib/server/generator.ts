import fs from "node:fs/promises";
import path from "node:path";
import { Suggestion } from "@/lib/types";
import { runOpenAIJson } from "@/lib/server/openai";

const AVENUES = ["impact", "accountability", "data-first"] as const;
export type HeadlineLanguage = "nl" | "en";

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

function compliancePass(suggestions: Suggestion[], headlineLanguage: HeadlineLanguage): Suggestion[] {
  return suggestions.map((s) => {
    const cleaned = s.headline.replace(/\s+/g, " ").trim();
    const softened = headlineLanguage === "en"
      ? cleaned.replace(/\bfraud\b/gi, "possible fraud")
      : cleaned.replace(/\bfraude\b/gi, "mogelijke fraude");
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
  headlineLanguage: HeadlineLanguage;
}): Promise<Suggestion[]> {
  const model = process.env.HEADLINE_MODEL || "gpt-4.1";
  const englishAdapterInstruction = [
    "The active profile and guidelines are primarily written in Dutch.",
    "Treat them as editorial principles and house-style signals, not as copy to translate line by line.",
    "Preserve the underlying FTM values: specificity, accountability, concreteness, skepticism, news value, and legal caution.",
    "Write headlines that sound like natural, publishable English headlines for an investigative newsroom, not like translated Dutch.",
    "Avoid calques, Dutch syntax, or obviously literal phrasing.",
    "If a Dutch rule does not map directly to idiomatic English, keep the editorial intent and express it in strong natural English.",
    "If the source draft is in Dutch, first infer the core angle and facts, then write fresh English headlines from that understanding.",
    "Never mention that the source materials or draft may be Dutch.",
  ].join(" ");
  const outputLanguageInstruction = args.headlineLanguage === "en"
    ? [
        "Output ALL headlines in English.",
        "Do not translate literally from Dutch; write natural, publishable English headlines in FTM style.",
        "Write rationale and evidence_needed in English.",
        "risk_note must still be exactly one of: laag, middel, hoog.",
      ].join(" ")
    : [
        "Output ALTIJD Nederlands.",
        "Schrijf rationale en evidence_needed ook in het Nederlands.",
        "risk_note moet exact een van deze waarden zijn: laag, middel, hoog.",
      ].join(" ");
  const languageAdapterSection = args.headlineLanguage === "en"
    ? `\nENGLISH ADAPTER:\n${englishAdapterInstruction}\n`
    : "";
  const systemPrompt = `
Je bent FTM Headline Coach. ${outputLanguageInstruction}
Geef exact 9 koppen. Voor ronde 1: precies 3x impact, 3x accountability, 3x data-first.
Houd rekening met stijlregels en juridische voorzichtigheid.
${args.headlineLanguage === "en" ? englishAdapterInstruction : ""}
`;
  const userPrompt = `
ACTIEF PROFIEL:
${args.profilePrompt}

RICHTLIJNEN:
${args.guidelinesText}
${languageAdapterSection}

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
  const compliant = compliancePass(payload.suggestions, args.headlineLanguage);
  return enforceAvenueDistribution(compliant);
}
