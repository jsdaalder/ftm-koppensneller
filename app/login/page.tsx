"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  HEADLINE_LANGUAGE_PARAM,
  HeadlineLanguage,
  readHeadlineLanguageFromStorage,
  writeHeadlineLanguageToStorage,
} from "@/lib/headline-language";

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
      return "Inloggen is mislukt tijdens de verificatie. Probeer opnieuw.";
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

type LoginLanguageCopy = LoginCopy & {
  switch_language_button: string;
  email_placeholder: string;
  cooldown_reset: string;
  sending_link: string;
  link_sent: string;
  google_error: string;
  allowed_error: string;
  cooldown_error_prefix: string;
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

const fallbackDutchLandingCopy: LoginLanguageCopy = {
  ...fallbackLoginCopy,
  switch_language_button: "English",
  email_placeholder: "naam@ftm.nl",
  cooldown_reset: "Reset timer",
  sending_link: "Magic link wordt verstuurd...",
  link_sent: "Controleer je e-mail voor de magic link.",
  google_error: "Inlogfout (Google):",
  allowed_error: "Alleen @ftm.nl e-mailadressen zijn toegestaan voor magic link login.",
  cooldown_error_prefix: "Je kunt over",
};

const fallbackEnglishLoginCopy: LoginLanguageCopy = {
  kicker: "FTM Headline Coach",
  title: "Sharper headlines, with editorial discipline.",
  hero_copy: "Internal tool for editors: generate headlines in rounds, give feedback, and improve what works.",
  accent: "Investigative journalism",
  form_title: "Log in",
  form_copy: "Use your approved FTM email address. You will receive a magic link immediately.",
  magic_link_button: "Send magic link",
  google_button: "Log in with Google",
  switch_language_button: "Nederlands",
  email_placeholder: "name@ftm.nl",
  cooldown_reset: "Reset timer",
  sending_link: "Sending magic link...",
  link_sent: "Check your email for the magic link.",
  google_error: "Login error (Google):",
  allowed_error: "Only @ftm.nl email addresses are allowed for magic link login.",
  cooldown_error_prefix: "You can try again in",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [cooldownUntilMs, setCooldownUntilMs] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [loginCopy, setLoginCopy] = useState<LoginLanguageCopy>(fallbackDutchLandingCopy);
  const [englishCopy, setEnglishCopy] = useState<LoginLanguageCopy>(fallbackEnglishLoginCopy);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [headlineLanguage, setHeadlineLanguage] = useState<HeadlineLanguage>("nl");
  const googleLoginEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN === "true";
  const isEnglishUi = headlineLanguage === "en";
  const displayedCopy: LoginLanguageCopy = isEnglishUi
    ? englishCopy
    : loginCopy;

  useEffect(() => {
    const storedLanguage = readHeadlineLanguageFromStorage();
    const resolvedLanguage = storedLanguage ?? "nl";
    writeHeadlineLanguageToStorage(resolvedLanguage);
    setHeadlineLanguage(resolvedLanguage);
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
    const errorId = params.get("error_id");
    if (errorCode) {
      const message = mapLoginErrorParam(errorCode);
      setMsg(errorId ? `${message} (diagnostic ID: ${errorId})` : message);
    }

    // If already authenticated, skip the login screen.
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (data?.user) {
          window.location.href = `/app?${HEADLINE_LANGUAGE_PARAM}=${resolvedLanguage}`;
        }
      } catch {
        // ignore
      }
    })();

    void (async () => {
      const res = await fetch("/api/ui-copy");
      const json = await res.json().catch(() => ({}));
      const login = json?.copy?.login;
      const loginEn = json?.copy?.login_en;
      if (login) {
        const nextDutch: LoginLanguageCopy = {
          kicker: String(login.kicker || fallbackDutchLandingCopy.kicker),
          title: String(login.title || fallbackDutchLandingCopy.title),
          hero_copy: String(login.hero_copy || fallbackDutchLandingCopy.hero_copy),
          accent: String(login.accent || fallbackDutchLandingCopy.accent),
          form_title: String(login.form_title || fallbackDutchLandingCopy.form_title),
          form_copy: String(login.form_copy || fallbackDutchLandingCopy.form_copy),
          magic_link_button: String(login.magic_link_button || fallbackDutchLandingCopy.magic_link_button),
          google_button: String(login.google_button || fallbackDutchLandingCopy.google_button),
          switch_language_button: String(login.switch_language_button || fallbackDutchLandingCopy.switch_language_button),
          email_placeholder: String(login.email_placeholder || fallbackDutchLandingCopy.email_placeholder),
          cooldown_reset: String(login.cooldown_reset || fallbackDutchLandingCopy.cooldown_reset),
          sending_link: String(login.sending_link || fallbackDutchLandingCopy.sending_link),
          link_sent: String(login.link_sent || fallbackDutchLandingCopy.link_sent),
          google_error: String(login.google_error || fallbackDutchLandingCopy.google_error),
          allowed_error: String(login.allowed_error || fallbackDutchLandingCopy.allowed_error),
          cooldown_error_prefix: String(login.cooldown_error_prefix || fallbackDutchLandingCopy.cooldown_error_prefix),
        };
        setLoginCopy(nextDutch);
      }
      if (loginEn) {
        setEnglishCopy({
          kicker: String(loginEn.kicker || fallbackEnglishLoginCopy.kicker),
          title: String(loginEn.title || fallbackEnglishLoginCopy.title),
          hero_copy: String(loginEn.hero_copy || fallbackEnglishLoginCopy.hero_copy),
          accent: String(loginEn.accent || fallbackEnglishLoginCopy.accent),
          form_title: String(loginEn.form_title || fallbackEnglishLoginCopy.form_title),
          form_copy: String(loginEn.form_copy || fallbackEnglishLoginCopy.form_copy),
          magic_link_button: String(loginEn.magic_link_button || fallbackEnglishLoginCopy.magic_link_button),
          google_button: String(loginEn.google_button || fallbackEnglishLoginCopy.google_button),
          switch_language_button: String(loginEn.switch_language_button || fallbackEnglishLoginCopy.switch_language_button),
          email_placeholder: String(loginEn.email_placeholder || fallbackEnglishLoginCopy.email_placeholder),
          cooldown_reset: String(loginEn.cooldown_reset || fallbackEnglishLoginCopy.cooldown_reset),
          sending_link: String(loginEn.sending_link || fallbackEnglishLoginCopy.sending_link),
          link_sent: String(loginEn.link_sent || fallbackEnglishLoginCopy.link_sent),
          google_error: String(loginEn.google_error || fallbackEnglishLoginCopy.google_error),
          allowed_error: String(loginEn.allowed_error || fallbackEnglishLoginCopy.allowed_error),
          cooldown_error_prefix: String(loginEn.cooldown_error_prefix || fallbackEnglishLoginCopy.cooldown_error_prefix),
        });
      }
    })();

    return () => window.clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, cooldownUntilMs - nowMs);
  const isCoolingDown = remainingMs > 0;
  const configuredAppUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();

  function getAuthRedirectTo(): string {
    const origin = window.location.origin;
    const nextTarget = headlineLanguage
      ? `/app?${HEADLINE_LANGUAGE_PARAM}=${headlineLanguage}`
      : "/app";
    if (configuredAppUrl) {
      const base = configuredAppUrl.replace(/\/+$/, "");
      return `${base}/auth/callback?next=${encodeURIComponent(nextTarget)}`;
    }
    return `${origin}/auth/callback?next=${encodeURIComponent(nextTarget)}`;
  }

  function chooseLanguage(value: HeadlineLanguage) {
    writeHeadlineLanguageToStorage(value);
    setHeadlineLanguage(value);
    setMsg("");
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        window.location.href = `/app?${HEADLINE_LANGUAGE_PARAM}=${value}`;
      }
    })();
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
      setMsg(displayedCopy.allowed_error);
      return;
    }
    if (isCoolingDown) {
      setMsg(`${displayedCopy.cooldown_error_prefix} ${formatRemaining(remainingMs)} opnieuw proberen.`);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const redirectTo = getAuthRedirectTo();
    setIsSendingLink(true);
    setMsg(displayedCopy.sending_link);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (!error) {
      setMsg(displayedCopy.link_sent);
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
      setMsg(`${displayedCopy.google_error} ${error.message}`);
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
          <p className="ftm-login-kicker">{displayedCopy.kicker}</p>
          <h1 className="ftm-login-title">{displayedCopy.title}</h1>
          <p className="ftm-login-copy">{displayedCopy.hero_copy}</p>
          <div className="ftm-login-accent-row">
            <span className="ftm-login-dot" />
            <span>{displayedCopy.accent}</span>
          </div>
        </div>
      </section>

      <section className="ftm-login-panel">
        <div className="ftm-login-card">
          <div className="ftm-login-form-header">
            <h2 className="ftm-login-form-title">{displayedCopy.form_title}</h2>
            <button
              type="button"
              className="ftm-login-language-switch"
              onClick={() => chooseLanguage(isEnglishUi ? "nl" : "en")}
            >
              {displayedCopy.switch_language_button}
            </button>
          </div>
          <p className="ftm-login-form-copy">{displayedCopy.form_copy}</p>
          <form onSubmit={onLogin} className="ftm-login-form">
          <input
            type="email"
            placeholder={displayedCopy.email_placeholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="ftm-input"
          />
          <button type="submit" disabled={isCoolingDown || isSendingLink} className="ftm-button">
            {isSendingLink
              ? (isEnglishUi ? "Sending..." : "Bezig met versturen...")
              : isCoolingDown
                ? (isEnglishUi ? `Wait ${formatRemaining(remainingMs)}` : `Wacht ${formatRemaining(remainingMs)}`)
                : displayedCopy.magic_link_button}
          </button>
          {googleLoginEnabled && (
            <button
              type="button"
              onClick={onGoogleLogin}
              className="ftm-button"
              style={{ background: "#2a2d33" }}
            >
              {displayedCopy.google_button}
            </button>
          )}
          </form>
        {isCoolingDown && (
            <p className="ftm-login-meta">
              {isEnglishUi
                ? `Too many requests. Remaining time: ${formatRemaining(remainingMs)}. `
                : `Te veel verzoeken. Resterende tijd: ${formatRemaining(remainingMs)}. `}
              <button
                type="button"
                onClick={() => {
                  clearCooldown();
                  setCooldownUntilMs(0);
                  setMsg("");
                }}
                style={{ marginLeft: 8, background: "transparent", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer" }}
              >
                {displayedCopy.cooldown_reset}
              </button>
            </p>
          )}
          {msg && <p className="ftm-login-meta">{msg}</p>}
        </div>
      </section>
    </main>
  );
}
