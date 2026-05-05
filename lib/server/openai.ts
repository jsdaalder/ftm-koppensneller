type OpenAIJsonRequest = {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
};

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function extractOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const output = data.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (typeof b.text === "string" && b.text.trim()) return b.text;
        if (typeof b.output_text === "string" && b.output_text.trim()) return b.output_text;
      }
    }
  }

  return null;
}

export async function runOpenAIJson<T>(req: OpenAIJsonRequest): Promise<T> {
  const timeoutMs = req.timeoutMs ?? Number(process.env.OPENAI_TIMEOUT_MS || 90000);
  const maxRetries = Number(process.env.OPENAI_MAX_RETRIES || 2);

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        signal: withTimeout(timeoutMs),
        body: JSON.stringify({
          model: req.model,
          input: [
            { role: "system", content: [{ type: "input_text", text: req.systemPrompt }] },
            { role: "user", content: [{ type: "input_text", text: req.userPrompt }] },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "headline_payload",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  suggestions: {
                    type: "array",
                    minItems: 9,
                    maxItems: 9,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        headline: { type: "string" },
                        avenue: { type: "string", enum: ["impact", "accountability", "data-first"] },
                        confidence: { type: "number" },
                        rationale: { type: "string" },
                        risk_note: { type: "string", enum: ["laag", "middel", "hoog"] },
                        evidence_needed: { type: "string" },
                      },
                      required: [
                        "headline",
                        "avenue",
                        "confidence",
                        "rationale",
                        "risk_note",
                        "evidence_needed",
                      ],
                    },
                  },
                },
                required: ["suggestions"],
              },
            },
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`OpenAI HTTP ${res.status}`);
      }
      const json = await res.json();
      const outputText = extractOutputText(json);
      if (!outputText) throw new Error("Missing output_text from OpenAI response.");
      return JSON.parse(outputText) as T;
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries) break;
      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function runOpenAIText(params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
}): Promise<string> {
  const timeoutMs = params.timeoutMs ?? Number(process.env.OPENAI_TIMEOUT_MS || 90000);
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    signal: withTimeout(timeoutMs),
    body: JSON.stringify({
      model: params.model,
      input: [
        { role: "system", content: [{ type: "input_text", text: params.systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: params.userPrompt }] },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const json = await res.json();
  const outputText = extractOutputText(json);
  if (!outputText) throw new Error("Missing output_text from OpenAI response.");
  return outputText;
}
