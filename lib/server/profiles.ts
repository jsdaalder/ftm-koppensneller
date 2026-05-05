import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ActiveProfile = {
  profile_id: string;
  prompt_markdown: string;
  meta_json: Record<string, unknown>;
};

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function filesystemFallback(): Promise<ActiveProfile | null> {
  const roots = [
    process.env.PROMPT_PROFILES_DIR ? path.resolve(process.env.PROMPT_PROFILES_DIR) : null,
    path.resolve(process.cwd(), "prompt_profiles"),
    path.resolve(process.cwd(), "archive", "deprecated_pre_next", "prompt_profiles"),
    path.resolve(process.cwd(), "..", "prompt_profiles"),
  ].filter(Boolean) as string[];

  for (const root of roots) {
    const pointerPath = path.join(root, "current_profile.json");
    const pointerRaw = await readFileIfExists(pointerPath);
    if (!pointerRaw) continue;
    const pointer = JSON.parse(pointerRaw) as { profile_id: string };
    const mdPath = path.join(root, `${pointer.profile_id}.md`);
    const metaPath = path.join(root, `${pointer.profile_id}.meta.json`);
    const prompt_markdown = (await readFileIfExists(mdPath)) ?? "";
    const metaRaw = (await readFileIfExists(metaPath)) ?? "{}";
    return { profile_id: pointer.profile_id, prompt_markdown, meta_json: JSON.parse(metaRaw) };
  }
  return null;
}

export async function getActiveProfile(): Promise<ActiveProfile> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("profile_id,prompt_markdown,meta_json")
    .eq("is_active", true)
    .maybeSingle();
  if (data) return data;

  const fallback = await filesystemFallback();
  if (!fallback) throw new Error("Geen actief promptprofiel gevonden.");
  return fallback;
}

export async function upsertActiveProfile(args: {
  profileId: string;
  promptMarkdown: string;
  metaJson: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  await admin.from("profiles").update({ is_active: false }).eq("is_active", true);
  const { error } = await admin.from("profiles").upsert(
    {
      profile_id: args.profileId,
      prompt_markdown: args.promptMarkdown,
      meta_json: args.metaJson,
      is_active: true,
    },
    { onConflict: "profile_id" },
  );
  if (error) throw error;
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
