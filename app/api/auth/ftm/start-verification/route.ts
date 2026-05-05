export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireScopedUser } from "@/lib/server/auth";
import { startFtmVerification } from "@/lib/server/ftm_verification";
import { assertSameOrigin } from "@/lib/server/security";

const schema = z.object({
  ftm_email: z.string().email(),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireScopedUser();
    const parsed = schema.parse(await req.json());
    await startFtmVerification(user.id, parsed.ftm_email);
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "MISSING_RESEND_API_KEY") {
      return NextResponse.json(
        {
          error: "E-mailverzending is niet geconfigureerd. Neem contact op met de beheerder.",
          error_code: "EMAIL_SENDING_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }
    const http =
      msg === "UNAUTHORIZED" ? 401
      : msg === "FORBIDDEN_NO_ROLE" ? 403
      : msg === "FORBIDDEN_EMAIL_DOMAIN" ? 403
      : msg === "INVALID_FTM_DOMAIN" ? 400
      : 500;
    return NextResponse.json({ error: msg }, { status: http });
  }
}
