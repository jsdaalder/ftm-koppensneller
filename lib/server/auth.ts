import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function creatorEmailAllowed(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  const creators = parseCsv(process.env.CREATOR_EMAILS);
  if (creators.length === 0) return false;
  return creators.includes(normalized);
}

function emailAllowed(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase();
  const allowedEmails = parseCsv(process.env.ALLOWED_EMAILS);
  // Additive allowlist: explicit emails are allowed in addition to domain allow.
  if (allowedEmails.includes(normalized)) return true;
  const allowedDomains = parseCsv(process.env.ALLOWED_EMAIL_DOMAINS || "followthemoney.nl,ftm.nl");
  const domain = normalized.split("@")[1] || "";
  return allowedDomains.includes(domain);
}

function domainAllowed(email?: string | null): boolean {
  if (!email) return false;
  const allowedDomains = parseCsv(process.env.ALLOWED_EMAIL_DOMAINS || "followthemoney.nl,ftm.nl");
  const domain = email.toLowerCase().split("@")[1] || "";
  return allowedDomains.includes(domain);
}

export async function requireScopedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function requireUser() {
  const user = await requireScopedUser();

  const identityAllowed = emailAllowed(user.email);
  if (!identityAllowed) {
    const admin = createSupabaseAdminClient();
    const { data: verification } = await admin
      .from("user_ftm_verification")
      .select("ftm_email,ftm_verified_at")
      .eq("user_id", user.id)
      .maybeSingle();
    const verifiedFtm = Boolean(verification?.ftm_verified_at && domainAllowed(verification?.ftm_email));
    if (!verifiedFtm) {
      throw new Error("FORBIDDEN_FTM_NOT_VERIFIED");
    }
  }
  return user;
}

export async function requireCreator(userId: string) {
  // Optional explicit creator allowlist without requiring DB setup.
  const {
    data: { user },
  } = await (await createSupabaseServerClient()).auth.getUser();
  if (user?.email && creatorEmailAllowed(user.email)) return;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data || data.role !== "creator") {
    throw new Error("FORBIDDEN");
  }
}

export async function isCreator(userId: string, email?: string | null): Promise<boolean> {
  if (email && creatorEmailAllowed(email)) return true;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "creator";
}
