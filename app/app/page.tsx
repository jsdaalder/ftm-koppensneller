"use client";

import { useEffect, useState } from "react";
import { NONE_OF_ABOVE_INDEX, Suggestion } from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  HEADLINE_LANGUAGE_PARAM,
  HeadlineLanguage,
  readHeadlineLanguageFromStorage,
  readHeadlineLanguageFromUrl,
  writeHeadlineLanguageToStorage,
} from "@/lib/headline-language";

type SessionState = {
  sessionId: string;
  roundNumber: number;
  suggestions: Suggestion[];
  headlineLanguage: HeadlineLanguage;
};

type RoundState = {
  roundNumber: number;
  suggestions: Suggestion[];
  selectedIndices: number[];
  feedbackText: string;
};

type AppCopy = {
  title: string;
  description: string;
  future_note: string;
  verification_title: string;
  verification_copy: string;
  start_session_button: string;
  next_round_button: string;
  language_switch_label: string;
  language_nl_button: string;
  language_en_button: string;
  language_changed: string;
  based_title: string;
  based_intro: string;
  based_sources_title: string;
  based_sources: string[];
  based_process: string;
  superprompt_link: string;
  github_link: string;
  how_title: string;
  how_copy: string;
  loading_verification: string;
  ftm_email_label: string;
  verification_code_label: string;
  send_code_button: string;
  verify_code_button: string;
  verification_email_required: string;
  verification_code_required: string;
  verification_code_sending: string;
  verification_code_sent: string;
  verification_code_checking: string;
  verification_success: string;
  verification_status_error: string;
  choose_edition_first: string;
  select_draft_first: string;
  draft_too_large: string;
  draft_too_large_tip: string;
  generating: string;
  unknown_error: string;
  upload_too_large: string;
  verify_first: string;
  round_ready: string;
  start_session_loading: string;
  logout_button: string;
  creator_queue_button: string;
  language_session_prefix: string;
  draft_label: string;
  email_placeholder: string;
  verification_code_placeholder: string;
  file_tip: string;
  only_md_error: string;
  draft_too_large_short: string;
  understood_generating: string;
  next_round_error_prefix: string;
  current_edition_prefix: string;
  round_title: string;
  older_round_notice: string;
  none_of_above: string;
  feedback_label: string;
  feedback_placeholder: string;
  next_round_loading: string;
  waiting_for_round: string;
  start_session_error_prefix: string;
  learnings_submitted: string;
  submit_learning_error_prefix: string;
  history_summary: string;
  selected_indices_prefix: string;
  none_of_above_short: string;
  feedback_history_prefix: string;
  dash: string;
};

const MAX_MD_UPLOAD_BYTES = 512 * 1024;

function headlineLanguageLabel(value: HeadlineLanguage): string {
  return value === "en" ? "FTM.eu" : "FTM.nl";
}

function draftKind(name: string): "md" | "unknown" {
  const n = (name || "").toLowerCase();
  if (n.endsWith(".md")) return "md";
  return "unknown";
}

const fallbackAppCopy: AppCopy = {
  title: "FTM Koppensneller",
  description: "Deze tool genereert iteratief headline-opties voor je concept op basis van redactionele richtlijnen en historische voorbeelden.",
  future_note: "Geef vooral feedback op de gegenereerde koppen; die feedback gebruiken we om de richtlijnen en prompt stap voor stap te verbeteren.",
  verification_title: "Verifieer je FTM e-mailadres",
  verification_copy: "Je bent ingelogd met een extern account. Verifieer nu je FTM mailbox om de tool te gebruiken.",
  start_session_button: "Start sessie",
  next_round_button: "Nieuwe ronde",
  language_switch_label: "Taal en kopeditie",
  language_nl_button: "FTM.nl",
  language_en_button: "FTM.eu",
  language_changed: "Taal en kopeditie ingesteld op",
  based_title: "Waarop deze tool gebaseerd is",
  based_intro: "We gebruiken een uitgebreide LLM-superprompt om koppen te maken die passen bij Follow the Money.",
  based_sources_title: "Voor het Nederlandse profiel gebruikten we:",
  based_sources: [],
  based_process: "Op basis van deze bronnen bouwen we eerst een Nederlands superpromptprofiel. Voor FTM.eu hebben we dat profiel niet letterlijk vertaald: we hebben het aangepast voor natuurlijk internationaal Engels, de Engelse FTM.eu-doelgroep en de stijlpatronen uit een corpus van Engelse FTM-koppen vanaf 2024.",
  superprompt_link: "Bekijk de volledige LLM-superprompt",
  github_link: "Lees meer op GitHub",
  how_title: "Hoe je deze tool gebruikt",
  how_copy: "Upload je concept als .md (uit Google Docs). Daarna genereren we meerdere kop-opties in verschillende richtingen. Met jouw feedback sturen we elke volgende ronde bij.",
  loading_verification: "Verificatiestatus laden...",
  ftm_email_label: "FTM e-mailadres",
  verification_code_label: "Verificatiecode (6 cijfers)",
  send_code_button: "Stuur code",
  verify_code_button: "Verifieer code",
  verification_email_required: "Vul je FTM e-mailadres in.",
  verification_code_required: "Vul de 6-cijferige code in.",
  verification_code_sending: "Code wordt verstuurd...",
  verification_code_sent: "Verificatiecode verstuurd. Controleer je FTM mailbox.",
  verification_code_checking: "Code controleren...",
  verification_success: "FTM e-mailadres succesvol geverifieerd.",
  choose_edition_first: "Kies eerst een kopeditie.",
  select_draft_first: "Selecteer eerst een .md-bestand.",
  draft_too_large: "Bestand is te groot ({size} MB). Maximaal {max} MB voor .md.",
  draft_too_large_tip: "Tip: verwijder embeds en probeer opnieuw.",
  generating: "Genereren...",
  unknown_error: "Onbekende fout.",
  upload_too_large: "Upload te groot voor de server. Maak je .md-bestand kleiner en probeer opnieuw.",
  verification_status_error: "Kon verificatiestatus niet ophalen.",
  verify_first: "Verifieer eerst je FTM e-mailadres.",
  round_ready: "Ronde {round} klaar.",
  start_session_loading: "Bezig met genereren...",
  logout_button: "Uitloggen",
  creator_queue_button: "Creator Queue",
  language_session_prefix: "Kopeditie voor deze sessie:",
  draft_label: "Concept (.md)",
  email_placeholder: "naam@ftm.nl",
  verification_code_placeholder: "123456",
  file_tip: "Tip (Google Docs): File → Download → Markdown (.md). Upload daarna die .md hier.",
  only_md_error: "Alleen .md is toegestaan.",
  draft_too_large_short: "Bestand is te groot ({size} MB). Maximaal {max} MB voor .md.",
  understood_generating: "Begrepen. Nieuwe koppen worden gegenereerd...",
  next_round_error_prefix: "Fout bij volgende ronde:",
  current_edition_prefix: "Huidige kopeditie:",
  round_title: "Ronde {round}",
  older_round_notice: "Bekijkmodus: je kijkt naar een eerdere ronde. Selecteer de laatste ronde om verder te itereren.",
  none_of_above: "Geen van bovenstaande",
  feedback_label: "Feedback",
  feedback_placeholder: "Bijv. korter, scherper, juridisch voorzichtiger",
  next_round_loading: "Nieuwe koppen worden gegenereerd...",
  waiting_for_round: "Even geduld: we werken aan een nieuwe ronde met aangepaste koppen.",
  start_session_error_prefix: "Fout bij starten sessie:",
  learnings_submitted: "Learnings automatisch ingediend voor review.",
  submit_learning_error_prefix: "Fout bij indienen:",
  history_summary: "Bekijk feedback uit eerdere rondes",
  selected_indices_prefix: "Geselecteerde indices:",
  none_of_above_short: "geen van bovenstaande",
  feedback_history_prefix: "Feedback:",
  dash: "-",
};

function formatCopy(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}

function readAppCopy(value: unknown, fallback: AppCopy): AppCopy {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(
    Object.entries(fallback).map(([key, fallbackValue]) => [
      key,
      Array.isArray(fallbackValue)
        ? (Array.isArray(source[key]) ? source[key].map(String) : fallbackValue)
        : (typeof source[key] === "string" && source[key] ? source[key] : fallbackValue),
    ]),
  ) as AppCopy;
}

async function readResponsePayload(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as Record<string, unknown>;
  }
  const text = await res.text();
  return { error: text || `HTTP ${res.status}` };
}

function renderMaybeLink(text: string): React.ReactNode {
  const m = text.match(/^\s*\[([^\]]+)\]\(([^)]+)\)\s*$/);
  if (!m) return text;
  const label = m[1];
  const href = m[2];
  return (
    <a href={href} style={{ color: "#0b3b7a", fontWeight: 800 }}>
      {label}
    </a>
  );
}

export default function AppPage() {
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [feedback, setFeedback] = useState("");
  const [rounds, setRounds] = useState<RoundState[]>([]);
  const [activeRoundNumber, setActiveRoundNumber] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [requiresFtmVerification, setRequiresFtmVerification] = useState(false);
  const [ftmEmail, setFtmEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationMsg, setVerificationMsg] = useState("");
  const [loadingVerification, setLoadingVerification] = useState(true);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isGeneratingNextRound, setIsGeneratingNextRound] = useState(false);
  const [copyByLanguage, setCopyByLanguage] = useState<Record<HeadlineLanguage, AppCopy>>({
    nl: fallbackAppCopy,
    en: fallbackAppCopy,
  });
  const [isCreatorUser, setIsCreatorUser] = useState(false);
  const [headlineLanguage, setHeadlineLanguage] = useState<HeadlineLanguage | null>(null);
  const [languageResolved, setLanguageResolved] = useState(false);

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  useEffect(() => {
    let active = true;
    const currentUrl = new URL(window.location.href);
    const urlLanguage = readHeadlineLanguageFromUrl(currentUrl);
    const storedLanguage = readHeadlineLanguageFromStorage();
    const resolvedLanguage = urlLanguage ?? storedLanguage;
    if (resolvedLanguage) {
      writeHeadlineLanguageToStorage(resolvedLanguage);
      setHeadlineLanguage(resolvedLanguage);
    }
    if (urlLanguage) {
      currentUrl.searchParams.delete(HEADLINE_LANGUAGE_PARAM);
      window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    }
    setLanguageResolved(true);

    async function loadVerificationState() {
      const res = await fetch("/api/auth/ftm/status");
      const json = await res.json();
      if (!active) return;
      if (res.ok) {
        setRequiresFtmVerification(Boolean(json.requires_ftm_verification));
        if (json.status?.pending_ftm_email) setFtmEmail(json.status.pending_ftm_email);
        const meRes = await fetch("/api/auth/me");
        const meJson = await meRes.json().catch(() => ({}));
        if (meRes.ok) setIsCreatorUser(Boolean(meJson?.is_creator));
      } else {
        setVerificationMsg(json.error || fallbackAppCopy.verification_status_error);
      }
      setLoadingVerification(false);
    }
    void loadVerificationState();
    void (async () => {
      const res = await fetch("/api/ui-copy");
      const json = await res.json().catch(() => ({}));
      if (!active) return;
      setCopyByLanguage({
        nl: readAppCopy(json?.copy?.app, fallbackAppCopy),
        en: readAppCopy(json?.copy?.app_en, fallbackAppCopy),
      });
    })();
    return () => {
      active = false;
    };
  }, []);

  function selectHeadlineLanguage(value: HeadlineLanguage) {
    if (session) return;
    writeHeadlineLanguageToStorage(value);
    setHeadlineLanguage(value);
    setStatus(`${copyByLanguage[value].language_changed} ${headlineLanguageLabel(value)}.`);
  }

  async function sendVerificationCode() {
    if (!ftmEmail) return setVerificationMsg(copy.verification_email_required);
    setVerificationMsg(copy.verification_code_sending);
    const res = await fetch("/api/auth/ftm/start-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ftm_email: ftmEmail }),
    });
    const json = await res.json();
    if (!res.ok) return setVerificationMsg(json.error || copy.unknown_error);
    setVerificationMsg(copy.verification_code_sent);
  }

  async function submitVerificationCode() {
    if (!verificationCode) return setVerificationMsg(copy.verification_code_required);
    setVerificationMsg(copy.verification_code_checking);
    const res = await fetch("/api/auth/ftm/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: verificationCode }),
    });
    const json = await res.json();
    if (!res.ok) return setVerificationMsg(json.error || copy.unknown_error);
    setRequiresFtmVerification(false);
    setVerificationMsg(copy.verification_success);
    setVerificationCode("");
  }

  async function startSession() {
    if (!headlineLanguage) return setStatus(copy.choose_edition_first);
    if (!draftFile) return setStatus(copy.select_draft_first);
    {
      const kind = draftKind(draftFile.name);
      const limit = MAX_MD_UPLOAD_BYTES;
      if (draftFile.size > limit) {
        const mb = (draftFile.size / (1024 * 1024)).toFixed(1);
        const maxMb = (limit / (1024 * 1024)).toFixed(1);
        return setStatus(
          `${formatCopy(copy.draft_too_large, { size: mb, max: maxMb })} ${copy.draft_too_large_tip}`,
        );
      }
    }
    try {
      setIsStartingSession(true);
      const form = new FormData();
      form.append("draft", draftFile);
      form.append("headline_language", headlineLanguage);
      setStatus(copy.generating);
      const res = await fetch("/api/sessions", { method: "POST", body: form });
      const payload = await readResponsePayload(res);
      const error = typeof payload.error === "string" ? payload.error : copy.unknown_error;
      if (res.status === 413) {
        return setStatus(
          copy.upload_too_large,
        );
      }
      if (res.status === 403 && error === "FORBIDDEN_FTM_NOT_VERIFIED") {
        setRequiresFtmVerification(true);
        return setStatus(copy.verify_first);
      }
      if (!res.ok) return setStatus(error);
      setSession({
        sessionId: String(payload.session_id),
        roundNumber: Number(payload.round_number),
        suggestions: (payload.suggestions as Suggestion[]) ?? [],
        headlineLanguage: (payload.headline_language === "en" ? "en" : "nl") as HeadlineLanguage,
      });
      const firstRoundNumber = Number(payload.round_number);
      setRounds([
        {
          roundNumber: firstRoundNumber,
          suggestions: (payload.suggestions as Suggestion[]) ?? [],
          selectedIndices: [],
          feedbackText: "",
        },
      ]);
      setActiveRoundNumber(firstRoundNumber);
      setSelected([]);
      await submitLearnings(String(payload.session_id), true);
      setStatus(formatCopy(copy.round_ready, { round: "1" }));
    } catch (err) {
      setStatus(`${copy.start_session_error_prefix} ${err instanceof Error ? err.message : copy.unknown_error}`);
    } finally {
      setIsStartingSession(false);
    }
  }

  async function nextRound() {
    if (!session) return;
    if (!session.headlineLanguage) return setStatus(copy.choose_edition_first);
    try {
      setIsGeneratingNextRound(true);
      setStatus(copy.understood_generating);
      const selectedSnapshot = [...selected];
      const feedbackSnapshot = feedback;
      const res = await fetch(
        `/api/sessions/${session.sessionId}/rounds/${session.roundNumber + 1}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selected_indices: selected,
            feedback_text: feedback,
            user_revision_text: "",
            headline_language: session.headlineLanguage,
          }),
        },
      );
      const payload = await readResponsePayload(res);
      const error = typeof payload.error === "string" ? payload.error : copy.unknown_error;
      if (res.status === 403 && error === "FORBIDDEN_FTM_NOT_VERIFIED") {
        setRequiresFtmVerification(true);
        return setStatus(copy.verify_first);
      }
      if (!res.ok) return setStatus(error);
      const newRoundNumber = Number(payload.round_number);
      const newSuggestions = (payload.suggestions as Suggestion[]) ?? [];
      setRounds((prev) => {
        const updatedPrev = prev.map((round) =>
          round.roundNumber === session.roundNumber
            ? { ...round, selectedIndices: selectedSnapshot, feedbackText: feedbackSnapshot }
            : round,
        );
        return [
          ...updatedPrev,
          {
            roundNumber: newRoundNumber,
            suggestions: newSuggestions,
            selectedIndices: [],
            feedbackText: "",
          },
        ];
      });
      setActiveRoundNumber(newRoundNumber);
      setSession({
        sessionId: session.sessionId,
        roundNumber: newRoundNumber,
        suggestions: newSuggestions,
        headlineLanguage: (payload.headline_language === "en" ? "en" : headlineLanguage) as HeadlineLanguage,
      });
      setSelected([]);
      setFeedback("");
      await submitLearnings(session.sessionId, true);
      setStatus(formatCopy(copy.round_ready, { round: String(payload.round_number) }));
    } catch (err) {
      setStatus(`${copy.next_round_error_prefix} ${err instanceof Error ? err.message : copy.unknown_error}`);
    } finally {
      setIsGeneratingNextRound(false);
    }
  }

  function toggleHeadline(index: number, checked: boolean) {
    setSelected((prev) => {
      if (index === NONE_OF_ABOVE_INDEX) {
        return checked ? [NONE_OF_ABOVE_INDEX] : prev.filter((value) => value !== NONE_OF_ABOVE_INDEX);
      }
      const withoutNone = prev.filter((value) => value !== NONE_OF_ABOVE_INDEX);
      return checked
        ? [...withoutNone, index]
        : withoutNone.filter((value) => value !== index);
    });
  }

  const activeRound = rounds.find((r) => r.roundNumber === activeRoundNumber) ?? null;
  const isViewingLatestRound = !session || !activeRound ? false : activeRound.roundNumber === session.roundNumber;

  async function submitLearnings(sessionIdArg?: string, silent = false) {
    const targetSessionId = sessionIdArg || session?.sessionId;
    if (!targetSessionId) return;
    try {
      const language = session?.headlineLanguage ?? headlineLanguage;
      const body = language ? JSON.stringify({ headline_language: language }) : undefined;
      const res = await fetch(`/api/sessions/${targetSessionId}/submit-feedback`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });
      const payload = await readResponsePayload(res);
      const error = typeof payload.error === "string" ? payload.error : copy.unknown_error;
      if (!res.ok && !silent) return setStatus(error);
      if (!res.ok) return;
      if (!silent) setStatus(copy.learnings_submitted);
    } catch (err) {
      if (!silent) {
        setStatus(`${copy.submit_learning_error_prefix} ${err instanceof Error ? err.message : copy.unknown_error}`);
      }
    }
  }

  const currentHeadlineLanguage = headlineLanguage ?? session?.headlineLanguage ?? null;
  const copy = copyByLanguage[currentHeadlineLanguage ?? "nl"];

  useEffect(() => {
    if (!loadingVerification && !requiresFtmVerification && languageResolved && !currentHeadlineLanguage && !session) {
      window.location.href = "/login";
    }
  }, [currentHeadlineLanguage, languageResolved, loadingVerification, requiresFtmVerification, session]);

  return (
    <main className="ftm-tool-shell">
      <section className="ftm-tool-panel">
      {loadingVerification && <div className="ftm-coach-card">{copy.loading_verification}</div>}
      {!loadingVerification && requiresFtmVerification && (
        <div className="ftm-coach-card">
          <h2 className="ftm-coach-h2">{copy.verification_title}</h2>
          <p>{copy.verification_copy}</p>
          <label className="ftm-coach-label">{copy.ftm_email_label}</label>
          <input
            className="ftm-coach-input"
            type="email"
            value={ftmEmail}
            onChange={(e) => setFtmEmail(e.target.value)}
            placeholder={copy.email_placeholder}
          />
          <button className="ftm-coach-btn" onClick={sendVerificationCode}>{copy.send_code_button}</button>
          <label className="ftm-coach-label">{copy.verification_code_label}</label>
          <input
            className="ftm-coach-input"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
            placeholder={copy.verification_code_placeholder}
          />
          <button className="ftm-coach-btn" onClick={submitVerificationCode}>{copy.verify_code_button}</button>
          {verificationMsg && <p className="ftm-coach-meta">{verificationMsg}</p>}
        </div>
      )}

      {!requiresFtmVerification && languageResolved && currentHeadlineLanguage && (
        <div className="ftm-coach-card">
          <div className="ftm-coach-row">
            <div className="ftm-coach-row" style={{ gap: 14 }}>
              <img
                src="/brand/ftm-logo-standard-black.svg"
                alt="Follow the Money"
                style={{ height: 20, width: "auto", display: "block" }}
              />
              <h1 className="ftm-coach-h1" style={{ margin: 0 }}>
                {copy.title}
              </h1>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {isCreatorUser && (
                <a
                  href="/creator/queue"
                  className="ftm-coach-btn ftm-coach-btn-dark"
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                >
                  {copy.creator_queue_button}
                </a>
              )}
              <button className="ftm-coach-btn ftm-coach-btn-dark" type="button" onClick={logout}>{copy.logout_button}</button>
            </div>
          </div>
          <p className="ftm-coach-meta">{copy.description}</p>
          <div className="ftm-doc-prose">
            <details className="ftm-doc-accordion">
              <summary>{copy.based_title}</summary>
              <div className="ftm-doc-accordion-body">
                <p>{copy.based_intro}</p>
                <p>{copy.based_sources_title}</p>
                <ul>
                  {copy.based_sources.map((item, i) => <li key={`${i}-${item}`}>{renderMaybeLink(item)}</li>)}
                </ul>
                <p>{copy.based_process}</p>
                <p>{renderMaybeLink(copy.superprompt_link)}</p>
                <p>{renderMaybeLink(copy.github_link)}</p>
              </div>
            </details>
            <details className="ftm-doc-accordion">
              <summary>{copy.how_title}</summary>
              <div className="ftm-doc-accordion-body">
                <p>{copy.how_copy}</p>
              </div>
            </details>
          </div>
          <p className="ftm-coach-meta">{copy.future_note}</p>
          <p className="ftm-coach-meta">
            {copy.language_session_prefix} <strong>{headlineLanguageLabel(currentHeadlineLanguage)}</strong>
          </p>
          <label className="ftm-coach-label">{copy.language_switch_label}</label>
          <button
            type="button"
            className={`ftm-app-language-switch ${currentHeadlineLanguage === "en" ? "is-on" : ""}`}
            role="switch"
            aria-checked={currentHeadlineLanguage === "en"}
            aria-label={`${copy.language_switch_label}: ${headlineLanguageLabel(currentHeadlineLanguage)}`}
            onClick={() => selectHeadlineLanguage(currentHeadlineLanguage === "nl" ? "en" : "nl")}
            disabled={Boolean(session)}
          >
            <span className="ftm-app-language-switch-track" aria-hidden="true">
              <span className={`ftm-app-language-switch-thumb ${currentHeadlineLanguage === "en" ? "is-on" : ""}`} />
            </span>
            <span>{currentHeadlineLanguage === "en" ? copy.language_en_button : copy.language_nl_button}</span>
          </button>
          <label className="ftm-coach-label">{copy.draft_label}</label>
          <input
            className="ftm-coach-input"
            type="file"
            accept=".md"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setDraftFile(f);
              if (!f) return;
              const kind = draftKind(f.name);
              if (kind === "unknown") {
                setStatus(copy.only_md_error);
                return;
              }
              if (f.size > MAX_MD_UPLOAD_BYTES) {
                const mb = (f.size / (1024 * 1024)).toFixed(1);
                const maxMb = (MAX_MD_UPLOAD_BYTES / (1024 * 1024)).toFixed(1);
                setStatus(formatCopy(copy.draft_too_large_short, { size: mb, max: maxMb }));
                return;
              }
              setStatus("");
            }}
          />
          <p className="ftm-coach-meta">
            {copy.file_tip}
          </p>
          {!session && (
            <button className="ftm-coach-btn" onClick={startSession} disabled={isStartingSession}>
              {isStartingSession ? copy.start_session_loading : copy.start_session_button}
            </button>
          )}
          <p className="ftm-coach-meta">{status}</p>
        </div>
      )}

      {!requiresFtmVerification && session && (
        <div className="ftm-coach-card">
          <div className="ftm-round-header">
            <div>
              <h2 className="ftm-coach-h2" style={{ margin: 0 }}>
                {formatCopy(copy.round_title, { round: String(activeRound?.roundNumber ?? session.roundNumber) })}
              </h2>
              <p className="ftm-coach-meta" style={{ marginTop: 6 }}>
                {copy.current_edition_prefix} <strong>{currentHeadlineLanguage ? headlineLanguageLabel(currentHeadlineLanguage) : headlineLanguageLabel(session.headlineLanguage)}</strong>
              </p>
            </div>
            <div className="ftm-round-pills">
              {rounds.map((round) => (
                <button
                  key={`pill-${round.roundNumber}`}
                  type="button"
                  className={`ftm-round-pill ${round.roundNumber === activeRound?.roundNumber ? "is-active" : ""}`}
                  onClick={() => setActiveRoundNumber(round.roundNumber)}
                >
                  {round.roundNumber}
                </button>
              ))}
            </div>
          </div>

          {!isViewingLatestRound && (
            <p className="ftm-coach-meta">
              {copy.older_round_notice}
            </p>
          )}

          {(activeRound?.suggestions ?? session.suggestions).map((s, i) => (
            <label key={`${session.roundNumber}-${i}`} className="ftm-coach-suggestion">
              <input
                type="checkbox"
                checked={selected.includes(i)}
                disabled={!isViewingLatestRound || isGeneratingNextRound}
                onChange={(e) => toggleHeadline(i, e.target.checked)}
              />
              <span>[{i + 1}] {s.headline}</span>
            </label>
          ))}
          <label className="ftm-coach-suggestion">
            <input
              type="checkbox"
              checked={selected.includes(NONE_OF_ABOVE_INDEX)}
              disabled={!isViewingLatestRound || isGeneratingNextRound}
              onChange={(e) => toggleHeadline(NONE_OF_ABOVE_INDEX, e.target.checked)}
            />
            <span>{copy.none_of_above}</span>
          </label>
          <label className="ftm-coach-label">{copy.feedback_label}</label>
          <textarea
            className="ftm-coach-textarea"
            rows={4}
            value={feedback}
            disabled={!isViewingLatestRound || isGeneratingNextRound}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={copy.feedback_placeholder}
          />
          <button
            className="ftm-coach-btn"
            onClick={nextRound}
            disabled={isGeneratingNextRound || !isViewingLatestRound}
          >
            {isGeneratingNextRound ? copy.next_round_loading : copy.next_round_button}
          </button>
          {isGeneratingNextRound && (
            <p className="ftm-coach-meta">{copy.waiting_for_round}</p>
          )}

          {rounds.length > 1 && (
            <details className="ftm-round-history">
              <summary>{copy.history_summary}</summary>
              <div className="ftm-round-history-body">
                {rounds
                  .filter((round) => round.roundNumber < (session?.roundNumber ?? 0))
                  .map((round) => (
                    <div key={`history-${round.roundNumber}`} className="ftm-round-history-item">
                      <strong>{formatCopy(copy.round_title, { round: String(round.roundNumber) })}</strong>
                      <p className="ftm-coach-meta">
                        {copy.selected_indices_prefix} {round.selectedIndices.map((index) => (
                          index === NONE_OF_ABOVE_INDEX ? copy.none_of_above_short : String(index + 1)
                        )).join(", ") || copy.dash}
                      </p>
                      <p className="ftm-coach-meta">{copy.feedback_history_prefix} {round.feedbackText || copy.dash}</p>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </div>
      )}
      </section>
    </main>
  );
}
