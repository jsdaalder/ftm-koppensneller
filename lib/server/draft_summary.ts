import { runOpenAIText } from "@/lib/server/openai";

function fallbackSummaryFromText(draftText: string): string {
  const t = (draftText || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.slice(0, 700);
}

export async function summarizeDraftText(params: {
  draftText: string;
  genre: string;
}): Promise<{ summary: string; mode: "llm" | "fallback" }> {
  const model = process.env.DRAFT_SUMMARY_MODEL || "gpt-4.1-mini";
  const draftText = params.draftText || "";
  if (!draftText.trim()) return { summary: "", mode: "fallback" };

  try {
    const summary = await runOpenAIText({
      model,
      systemPrompt:
        "Je bent een redacteur. Vat conceptteksten samen zonder te speculeren. Output is Nederlands.",
      userPrompt: [
        "Taak: maak een korte samenvatting van de geuploade story draft.",
        "",
        "Regels:",
        "- 1 alinea (geen bullets).",
        "- 60-120 woorden.",
        "- Geen nieuwe feiten, geen aannames, geen namen verzinnen.",
        "- Benoem waar het stuk over gaat en wat de kernclaim/nieuwswaarde is (voor zover uit de tekst blijkt).",
        `- Genre (hint): ${params.genre}`,
        "",
        "DRAFT:",
        draftText,
      ].join("\n"),
      timeoutMs: Number(process.env.DRAFT_SUMMARY_TIMEOUT_MS || 45000),
    });
    const cleaned = summary.replace(/\s+/g, " ").trim();
    if (!cleaned) throw new Error("empty_summary");
    return { summary: cleaned, mode: "llm" };
  } catch {
    return { summary: fallbackSummaryFromText(draftText), mode: "fallback" };
  }
}

