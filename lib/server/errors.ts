export function errorToMessage(err: unknown): string {
  if (!err) return "Unknown error.";
  if (err instanceof Error) return err.message || "Unknown error.";
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    const msg = anyErr.message;
    if (typeof msg === "string" && msg.trim()) return msg;
    const code = anyErr.code;
    const details = anyErr.details;
    const hint = anyErr.hint;
    // Supabase errors often have { message, details, hint, code }
    const parts: string[] = [];
    if (typeof code === "string" && code) parts.push(code);
    if (typeof details === "string" && details) parts.push(details);
    if (typeof hint === "string" && hint) parts.push(hint);
    if (parts.length) return parts.join(" | ");
    try {
      return JSON.stringify(err);
    } catch {
      return "Unknown error.";
    }
  }
  return "Unknown error.";
}

