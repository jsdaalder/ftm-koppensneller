export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeErrorMessage(message: string): string {
  return message
    .replace(/(access_token|refresh_token|token_hash|code)(=|:)\S+/gi, "$1$2[redacted]")
    .slice(0, 300);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") || "/app";
  const eventId = crypto.randomUUID();
  const context = {
    eventId,
    host: url.host,
    userAgent: request.headers.get("user-agent")?.slice(0, 200) || "unknown",
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    type,
  };

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const authError = error as { name?: string; code?: string; status?: number };
      console.error("auth callback code exchange failed", {
        ...context,
        errorName: authError.name || "unknown",
        errorCode: authError.code || "unknown",
        errorStatus: authError.status || null,
        errorMessage: safeErrorMessage(error.message),
      });
      const loginUrl = new URL("/login", url.origin);
      loginUrl.searchParams.set("error", "oauth_callback_failed");
      loginUrl.searchParams.set("error_id", eventId);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.redirect(new URL(next, url.origin));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) {
      const authError = error as { name?: string; code?: string; status?: number };
      console.error("auth callback OTP verification failed", {
        ...context,
        errorName: authError.name || "unknown",
        errorCode: authError.code || "unknown",
        errorStatus: authError.status || null,
        errorMessage: safeErrorMessage(error.message),
      });
      const loginUrl = new URL("/login", url.origin);
      loginUrl.searchParams.set("error", "otp_callback_failed");
      loginUrl.searchParams.set("error_id", eventId);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.redirect(new URL(next, url.origin));
  }

  console.warn("auth callback missing parameters", context);
  const loginUrl = new URL("/login", url.origin);
  loginUrl.searchParams.set("error", "missing_auth_callback_params");
  loginUrl.searchParams.set("error_id", eventId);
  return NextResponse.redirect(loginUrl);
}
