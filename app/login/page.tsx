"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const RATE_LIMIT_KEY = "ftm_login_rate_limit_until_ms";
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_COOLDOWN_MS = 60 * 60 * 1000;

function readCooldownUntil(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(RATE_LIMIT_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function clearCooldown() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RATE_LIMIT_KEY);
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function parseCooldownFromError(message: string): number | null {
  const lower = message.toLowerCase();
  const secMatch = lower.match(/(\d+)\s*(second|seconds|sec|seconde|seconden)/);
  if (secMatch) return Math.min(Number(secMatch[1]) * 1000, MAX_COOLDOWN_MS);
  const minMatch = lower.match(/(\d+)\s*(minute|minutes|minuut|minuten|min)/);
  if (minMatch) return Math.min(Number(minMatch[1]) * 60 * 1000, MAX_COOLDOWN_MS);
  return null;
}

function mapLoginErrorParam(errorCode: string): string {
  switch (errorCode) {
    case "no_access_role":
      return "Je account heeft nog geen toegang. Neem contact op met de beheerder.";
    case "oauth_callback_failed":
      return "Inloggen met Google is mislukt. Probeer opnieuw.";
    case "otp_callback_failed":
      return "Verificatie via magic link is mislukt. Vraag een nieuwe link aan.";
    case "missing_code":
    case "missing_auth_callback_params":
      return "Ongeldige of onvolledige inloglink. Vraag een nieuwe link aan.";
    default:
      return `Inlogfout: ${errorCode}`;
  }
}

type LoginCopy = {
  kicker: string;
  title: string;
  hero_copy: string;
  accent: string;
  form_title: string;
  form_copy: string;
  magic_link_button: string;
  google_button: string;
};

const fallbackLoginCopy: LoginCopy = {
  kicker: "FTM Koppensneller",
  title: "Maak sterkere koppen, met redactionele scherpte.",
  hero_copy: "Interne tool voor redacties: genereer koppen in rondes, geef feedback en leer van wat werkt.",
  accent: "Onderzoeksjournalistiek",
  form_title: "Inloggen",
  form_copy: "Gebruik je goedgekeurde FTM e-mailadres. Je ontvangt direct een magic link.",
  magic_link_button: "Verstuur magic link",
  google_button: "Inloggen met Google",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [cooldownUntilMs, setCooldownUntilMs] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [copy, setCopy] = useState<LoginCopy>(fallbackLoginCopy);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const googleLoginEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN === "true";

  useEffect(() => {
    const stored = readCooldownUntil();
    if (stored > 0 && stored <= Date.now()) {
      clearCooldown();
      setCooldownUntilMs(0);
    } else {
      setCooldownUntilMs(stored);
    }
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);

    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get("error");
    if (errorCode) {
      setMsg(mapLoginErrorParam(errorCode));
    }

    // If already authenticated, skip the login screen.
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (data?.user) window.location.href = "/app";
      } catch {
        // ignore
      }
    })();

    void (async () => {
      const res = await fetch("/api/ui-copy");
      const json = await res.json().catch(() => ({}));
      const login = json?.copy?.login;
      if (!login) return;
      setCopy({
        kicker: String(login.kicker || fallbackLoginCopy.kicker),
        title: String(login.title || fallbackLoginCopy.title),
        hero_copy: String(login.hero_copy || fallbackLoginCopy.hero_copy),
        accent: String(login.accent || fallbackLoginCopy.accent),
        form_title: String(login.form_title || fallbackLoginCopy.form_title),
        form_copy: String(login.form_copy || fallbackLoginCopy.form_copy),
        magic_link_button: String(login.magic_link_button || fallbackLoginCopy.magic_link_button),
        google_button: String(login.google_button || fallbackLoginCopy.google_button),
      });
    })();

    return () => window.clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, cooldownUntilMs - nowMs);
  const isCoolingDown = remainingMs > 0;
  const configuredAppUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();

  function getAuthRedirectTo(): string {
    const origin = window.location.origin;
    if (configuredAppUrl) {
      const base = configuredAppUrl.replace(/\/+$/, "");
      return `${base}/auth/callback?next=/app`;
    }
    return `${origin}/auth/callback?next=/app`;
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    if (isSendingLink) return;
    const allowRes = await fetch("/api/auth/magiclink/allowed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const allowJson = await allowRes.json().catch(() => ({}));
    if (!allowRes.ok || allowJson.allowed !== true) {
      setMsg("Alleen @ftm.nl e-mailadressen zijn toegestaan voor magic link login.");
      return;
    }
    if (isCoolingDown) {
      setMsg(`Je kunt over ${formatRemaining(remainingMs)} opnieuw proberen.`);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const redirectTo = getAuthRedirectTo();
    setIsSendingLink(true);
    setMsg("Magic link wordt verstuurd...");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (!error) {
      setMsg("Controleer je e-mail voor de magic link.");
      setIsSendingLink(false);
      return;
    }

    const lower = error.message.toLowerCase();
    if (lower.includes("rate limit")) {
      const parsed = parseCooldownFromError(error.message);
      const baseMs = parsed ?? DEFAULT_COOLDOWN_MS;
      // If server still rate-limits after a wait, extend backoff progressively.
      const progressiveMs = parsed ? baseMs : Math.min(baseMs * 2, MAX_COOLDOWN_MS);
      const until = Date.now() + progressiveMs;
      setCooldownUntilMs(until);
      window.localStorage.setItem(RATE_LIMIT_KEY, String(until));
      setMsg(`Te veel aanvragen. Probeer het over ${formatRemaining(progressiveMs)} opnieuw.`);
      setIsSendingLink(false);
      return;
    }

    setMsg(`Inlogfout: ${error.message}`);
    setIsSendingLink(false);
  }

  async function onGoogleLogin() {
    clearCooldown();
    setCooldownUntilMs(0);
    const supabase = createSupabaseBrowserClient();
    const redirectTo = getAuthRedirectTo();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setMsg(`Inlogfout (Google): ${error.message}`);
    }
  }

  return (
    <main className="ftm-login-shell">
      <section className="ftm-login-hero" aria-hidden>
        <div className="ftm-login-hero-inner">
          <img
            src="/brand/ftm-logo-standard-black.svg"
            alt="Follow the Money"
            className="ftm-login-logo"
          />
          <p className="ftm-login-kicker">{copy.kicker}</p>
          <h1 className="ftm-login-title">{copy.title}</h1>
          <p className="ftm-login-copy">{copy.hero_copy}</p>
          <div className="ftm-login-accent-row">
            <span className="ftm-login-dot" />
            <span>{copy.accent}</span>
          </div>
        </div>
      </section>

      <section className="ftm-login-panel">
        <div className="ftm-login-card">
          <h2 className="ftm-login-form-title">{copy.form_title}</h2>
          <p className="ftm-login-form-copy">{copy.form_copy}</p>
          <form onSubmit={onLogin} className="ftm-login-form">
          <input
            type="email"
            placeholder="name@ftm.nl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="ftm-input"
          />
          <button type="submit" disabled={isCoolingDown || isSendingLink} className="ftm-button">
            {isSendingLink
              ? "Bezig met versturen..."
              : isCoolingDown
                ? `Wacht ${formatRemaining(remainingMs)}`
                : copy.magic_link_button}
          </button>
          {googleLoginEnabled && (
            <button type="button" onClick={onGoogleLogin} className="ftm-button" style={{ background: "#2a2d33" }}>
              {copy.google_button}
            </button>
          )}
          </form>
        {isCoolingDown && (
            <p className="ftm-login-meta">
              Te veel verzoeken. Resterende tijd: {formatRemaining(remainingMs)}.{" "}
              <button
                type="button"
                onClick={() => {
                  clearCooldown();
                  setCooldownUntilMs(0);
                  setMsg("");
                }}
                style={{ marginLeft: 8, background: "transparent", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer" }}
              >
                Reset timer
              </button>
            </p>
          )}
          {msg && <p className="ftm-login-meta">{msg}</p>}
        </div>
      </section>
    </main>
  );
}
