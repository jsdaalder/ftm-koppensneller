"use client";

import { useState } from "react";

export default function ApprovedFeedbackActions() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onGenerate() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/creator/export-approved-feedback", { method: "POST" });
      const text = await res.text();
      if (!res.ok) {
        setMsg(text || "Kon export niet genereren.");
        return;
      }
      setMsg("Export bijgewerkt. Pagina wordt ververst...");
      window.location.reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Onbekende fout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ftm-coach-stack">
      <div className="ftm-coach-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="ftm-coach-title" style={{ marginBottom: 2 }}>
            Approved feedback export
          </div>
          <div className="ftm-coach-subtitle">Creator-only. Genereert een nieuwe export uit alle goedgekeurde feedback.</div>
        </div>
        <button className="ftm-coach-btn ftm-coach-btn-accent" onClick={onGenerate} disabled={busy}>
          {busy ? "Bezig..." : "Genereer export"}
        </button>
      </div>
      {msg ? <div className="ftm-coach-note">{msg}</div> : null}
    </div>
  );
}

