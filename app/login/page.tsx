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

function renderMaybeLink(text: string): React.ReactNode {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    return match ? <a key={index} href={match[2]}>{match[1]}</a> : part;
  });
}

function parseCooldownFromError(message: string): number | null {
  const lower = message.toLowerCase();
  const secMatch = lower.match(/(\d+)\s*(second|seconds|sec|seconde|seconden)/);
  if (secMatch) return Math.min(Number(secMatch[1]) * 1000, MAX_COOLDOWN_MS);
  const minMatch = lower.match(/(\d+)\s*(minute|minutes|minuut|minuten|min)/);
  if (minMatch) return Math.min(Number(minMatch[1]) * 60 * 1000, MAX_COOLDOWN_MS);
  return null;
}

function mapLoginErrorParam(errorCode: string, copy: LoginLanguageCopy): string {
  switch (errorCode) {
    case "no_access_role":
      return copy.no_access_error;
    case "oauth_callback_failed":
      return copy.oauth_callback_error;
    case "otp_callback_failed":
      return copy.otp_callback_error;
    case "missing_code":
    case "missing_auth_callback_params":
      return copy.invalid_link_error;
    default:
      return `${copy.error_prefix} ${errorCode}`;
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
  rate_limit_error: string;
  rate_limit_suffix: string;
  cooldown_status_prefix: string;
  sending_button: string;
  waiting_button_prefix: string;
  error_prefix: string;
  cooldown_error_suffix: string;
  no_access_error: string;
  oauth_callback_error: string;
  otp_callback_error: string;
  invalid_link_error: string;
  based_title: string;
  based_intro: string;
};

const fallbackLoginCopy: LoginCopy = {
  kicker: "Follow the Money",
  title: "Koppensneller",
  hero_copy: "Interne tool voor de redactie van FTM om betere koppen te maken. Gemaakt door [Jan Daalder](https://jandaalder.nl/)",
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
  rate_limit_error: "Te veel aanvragen. Probeer het over",
  rate_limit_suffix: "opnieuw.",
  cooldown_status_prefix: "Te veel verzoeken. Resterende tijd:",
  sending_button: "Bezig met versturen...",
  waiting_button_prefix: "Wacht",
  error_prefix: "Inlogfout:",
  cooldown_error_suffix: "opnieuw proberen.",
  no_access_error: "Je account heeft nog geen toegang. Neem contact op met de beheerder.",
  oauth_callback_error: "Inloggen is mislukt tijdens de verificatie. Probeer opnieuw.",
  otp_callback_error: "Verificatie via magic link is mislukt. Vraag een nieuwe link aan.",
  invalid_link_error: "Ongeldige of onvolledige inloglink. Vraag een nieuwe link aan.",
  based_title: "Hoe deze tool werkt",
  based_intro: "Deze tool draait op gpt-4.1 en een uitgebreide [prompt](/docs/super-prompt). Lees meer over het project op [GitHub](https://github.com/jsdaalder/ftm-koppensneller).",
};

const fallbackEnglishLoginCopy: LoginLanguageCopy = {
  kicker: "by Jan Daalder",
  title: "FTM Headline Coach",
  hero_copy: "Internal tool for FTM’s editorial team to make better headlines.",
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
  cooldown_error_prefix: "Please wait",
  rate_limit_error: "Too many requests. Try again in",
  rate_limit_suffix: ".",
  cooldown_status_prefix: "Too many requests. Remaining time:",
  sending_button: "Sending...",
  waiting_button_prefix: "Wait",
  error_prefix: "Login error:",
  cooldown_error_suffix: "before trying again.",
  no_access_error: "Your account does not have access yet. Contact the administrator.",
  oauth_callback_error: "Login failed during verification. Please try again.",
  otp_callback_error: "Magic-link verification failed. Request a new link.",
  invalid_link_error: "Invalid or incomplete login link. Request a new link.",
  based_title: "How this tool works",
  based_intro: "This tool runs on gpt-4.1 and an extensive [prompt](/docs/super-prompt). Read more about the project on [GitHub](https://github.com/jsdaalder/ftm-koppensneller).",
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
      const message = mapLoginErrorParam(errorCode, resolvedLanguage === "en" ? fallbackEnglishLoginCopy : fallbackDutchLandingCopy);
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
          rate_limit_error: String(login.rate_limit_error || fallbackDutchLandingCopy.rate_limit_error),
          rate_limit_suffix: String(login.rate_limit_suffix || fallbackDutchLandingCopy.rate_limit_suffix),
          cooldown_status_prefix: String(login.cooldown_status_prefix || fallbackDutchLandingCopy.cooldown_status_prefix),
          sending_button: String(login.sending_button || fallbackDutchLandingCopy.sending_button),
          waiting_button_prefix: String(login.waiting_button_prefix || fallbackDutchLandingCopy.waiting_button_prefix),
          error_prefix: String(login.error_prefix || fallbackDutchLandingCopy.error_prefix),
          cooldown_error_suffix: String(login.cooldown_error_suffix || fallbackDutchLandingCopy.cooldown_error_suffix),
          no_access_error: String(login.no_access_error || fallbackDutchLandingCopy.no_access_error),
          oauth_callback_error: String(login.oauth_callback_error || fallbackDutchLandingCopy.oauth_callback_error),
          otp_callback_error: String(login.otp_callback_error || fallbackDutchLandingCopy.otp_callback_error),
          invalid_link_error: String(login.invalid_link_error || fallbackDutchLandingCopy.invalid_link_error),
          based_title: String(login.based_title || fallbackDutchLandingCopy.based_title),
          based_intro: String(login.based_intro || fallbackDutchLandingCopy.based_intro),
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
          rate_limit_error: String(loginEn.rate_limit_error || fallbackEnglishLoginCopy.rate_limit_error),
          rate_limit_suffix: String(loginEn.rate_limit_suffix || fallbackEnglishLoginCopy.rate_limit_suffix),
          cooldown_status_prefix: String(loginEn.cooldown_status_prefix || fallbackEnglishLoginCopy.cooldown_status_prefix),
          sending_button: String(loginEn.sending_button || fallbackEnglishLoginCopy.sending_button),
          waiting_button_prefix: String(loginEn.waiting_button_prefix || fallbackEnglishLoginCopy.waiting_button_prefix),
          error_prefix: String(loginEn.error_prefix || fallbackEnglishLoginCopy.error_prefix),
          cooldown_error_suffix: String(loginEn.cooldown_error_suffix || fallbackEnglishLoginCopy.cooldown_error_suffix),
          no_access_error: String(loginEn.no_access_error || fallbackEnglishLoginCopy.no_access_error),
          oauth_callback_error: String(loginEn.oauth_callback_error || fallbackEnglishLoginCopy.oauth_callback_error),
          otp_callback_error: String(loginEn.otp_callback_error || fallbackEnglishLoginCopy.otp_callback_error),
          invalid_link_error: String(loginEn.invalid_link_error || fallbackEnglishLoginCopy.invalid_link_error),
          based_title: String(loginEn.based_title || fallbackEnglishLoginCopy.based_title),
          based_intro: String(loginEn.based_intro || fallbackEnglishLoginCopy.based_intro),
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
      setMsg(`${displayedCopy.cooldown_error_prefix} ${formatRemaining(remainingMs)} ${displayedCopy.cooldown_error_suffix}`);
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
      setMsg(`${displayedCopy.rate_limit_error} ${formatRemaining(progressiveMs)} ${displayedCopy.rate_limit_suffix}`);
      setIsSendingLink(false);
      return;
    }

    setMsg(`${displayedCopy.error_prefix} ${error.message}`);
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
              ? displayedCopy.sending_button
              : isCoolingDown
                ? `${displayedCopy.waiting_button_prefix} ${formatRemaining(remainingMs)}`
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
              {`${displayedCopy.cooldown_status_prefix} ${formatRemaining(remainingMs)}. `}
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
          <details className="ftm-doc-accordion ftm-login-method">
            <summary>{displayedCopy.based_title}</summary>
            <div className="ftm-doc-accordion-body">
              <p>{renderMaybeLink(displayedCopy.based_intro)}</p>
            </div>
          </details>
        </div>
      </section>
    </main>
  );
}
