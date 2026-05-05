export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email(),
});

function csv(value: string | undefined): string[] {
  return (value || "")
    .split(/[,;\n]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedMagicLinkEmail(emailRaw: string): boolean {
  const email = emailRaw.trim().toLowerCase();
  if (email.endsWith("@ftm.nl")) return true;
  const exact = csv(process.env.ALLOWED_EMAILS);
  return exact.includes(email);
}

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.parse(await req.json());
    const allowed = isAllowedMagicLinkEmail(parsed.email);
    return NextResponse.json({ allowed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid request" },
      { status: 400 },
    );
  }
}
