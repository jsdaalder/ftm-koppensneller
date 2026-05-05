export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireScopedUser } from "@/lib/server/auth";
import { getFtmVerificationStatus } from "@/lib/server/ftm_verification";

function domainAllowed(email?: string | null): boolean {
  if (!email) return false;
  const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || "followthemoney.nl,ftm.nl")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const domain = email.toLowerCase().split("@")[1] || "";
  return allowedDomains.includes(domain);
}

export async function GET() {
  try {
    const user = await requireScopedUser();
    const status = await getFtmVerificationStatus(user.id);
    const loggedInDomainAllowed = domainAllowed(user.email ?? null);
    const verifiedFtm = Boolean(status?.ftm_verified_at && domainAllowed(status?.ftm_email ?? null));
    return NextResponse.json({
      status,
      user_email: user.email ?? null,
      requires_ftm_verification: !loggedInDomainAllowed && !verifiedFtm,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const http =
      msg === "UNAUTHORIZED" ? 401
      : msg === "FORBIDDEN_NO_ROLE" ? 403
      : msg === "FORBIDDEN_EMAIL_DOMAIN" ? 403
      : msg === "FORBIDDEN_FTM_NOT_VERIFIED" ? 403
      : 500;
    return NextResponse.json({ error: msg }, { status: http });
  }
}
