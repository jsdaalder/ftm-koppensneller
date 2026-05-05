export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireScopedUser } from "@/lib/server/auth";
import { verifyFtmCode } from "@/lib/server/ftm_verification";
import { assertSameOrigin } from "@/lib/server/security";

const schema = z.object({
  code: z.string().min(6).max(6),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireScopedUser();
    const parsed = schema.parse(await req.json());
    await verifyFtmCode(user.id, parsed.code);
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const http =
      msg === "UNAUTHORIZED" ? 401
      : msg === "FORBIDDEN_NO_ROLE" ? 403
      : msg === "FORBIDDEN_EMAIL_DOMAIN" ? 403
      : msg === "INVALID_CODE_FORMAT" ? 400
      : msg === "NO_PENDING_VERIFICATION" ? 400
      : msg === "CODE_EXPIRED" ? 400
      : msg === "TOO_MANY_ATTEMPTS" ? 429
      : msg === "INVALID_CODE" ? 400
      : 500;
    return NextResponse.json({ error: msg }, { status: http });
  }
}
