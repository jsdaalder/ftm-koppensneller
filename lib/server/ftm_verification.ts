import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const CODE_TTL_MINUTES = Number(process.env.FTM_VERIFICATION_CODE_TTL_MINUTES || 15);

function allowedFtmDomain(email: string): boolean {
  const domains = (process.env.ALLOWED_FTM_EMAIL_DOMAINS || "ftm.nl,followthemoney.nl")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const domain = email.toLowerCase().split("@")[1] || "";
  return domains.includes(domain);
}

function hashCode(email: string, code: string): string {
  const secret = process.env.FTM_VERIFICATION_SECRET || "replace_me_in_env";
  return crypto.createHash("sha256").update(`${secret}:${email.toLowerCase()}:${code}`).digest("hex");
}

function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

async function sendEmail(to: string, code: string) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    throw new Error("MISSING_RESEND_API_KEY");
  }
  const rawFrom = (process.env.FTM_VERIFICATION_FROM_EMAIL || "").trim();
  const fallbackFrom = "noreply@send.mail.example.com";
  const match = rawFrom.match(/<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>/);
  const normalizedFrom = match ? match[1] : rawFrom;
  const from = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedFrom) ? normalizedFrom : fallbackFrom;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "FTM Koppensneller verificatiecode",
      text: `Je verificatiecode is: ${code}. Deze code is ${CODE_TTL_MINUTES} minuten geldig.`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`EMAIL_SEND_FAILED_${res.status}:${body}`);
  }
}

export async function startFtmVerification(userId: string, ftmEmailRaw: string) {
  const ftmEmail = ftmEmailRaw.trim().toLowerCase();
  if (!allowedFtmDomain(ftmEmail)) throw new Error("INVALID_FTM_DOMAIN");

  const admin = createSupabaseAdminClient();
  const code = generateCode();
  const codeHash = hashCode(ftmEmail, code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

  const { error } = await admin.from("user_ftm_verification").upsert(
    {
      user_id: userId,
      pending_ftm_email: ftmEmail,
      code_hash: codeHash,
      code_expires_at: expiresAt,
      attempts: 0,
      last_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;

  await sendEmail(ftmEmail, code);
}

export async function verifyFtmCode(userId: string, codeRaw: string) {
  const code = codeRaw.trim();
  if (!/^\d{6}$/.test(code)) throw new Error("INVALID_CODE_FORMAT");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_ftm_verification")
    .select("pending_ftm_email,code_hash,code_expires_at,attempts")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data || !data.pending_ftm_email || !data.code_hash) {
    throw new Error("NO_PENDING_VERIFICATION");
  }

  if (data.code_expires_at && new Date(data.code_expires_at).getTime() < Date.now()) {
    throw new Error("CODE_EXPIRED");
  }
  if ((data.attempts ?? 0) >= 8) throw new Error("TOO_MANY_ATTEMPTS");

  const hashed = hashCode(data.pending_ftm_email, code);
  if (hashed !== data.code_hash) {
    await admin
      .from("user_ftm_verification")
      .update({ attempts: (data.attempts ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    throw new Error("INVALID_CODE");
  }

  const { error: updateError } = await admin
    .from("user_ftm_verification")
    .update({
      ftm_email: data.pending_ftm_email,
      ftm_verified_at: new Date().toISOString(),
      pending_ftm_email: null,
      code_hash: null,
      code_expires_at: null,
      attempts: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (updateError) throw updateError;
}

export async function getFtmVerificationStatus(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("user_ftm_verification")
    .select("ftm_email,ftm_verified_at,pending_ftm_email,last_sent_at")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}
