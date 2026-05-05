import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCreator } from "@/lib/server/auth";

export default async function CreatorHomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCreator(user.id, user.email ?? null))) redirect("/app");

  return (
    <main className="ftm-tool-shell">
      <section className="ftm-tool-panel">
        <div className="ftm-coach-card">
          <div className="ftm-coach-row">
            <h1 className="ftm-coach-h1">Creator Control Panel</h1>
            <a
              className="ftm-coach-btn ftm-coach-btn-dark"
              href="/app"
              style={{ textDecoration: "none" }}
            >
              Terug naar app
            </a>
          </div>
          <p className="ftm-coach-meta">
            Beheer ingestuurde feedback, reviewnotities en overzicht van gebruikers.
          </p>
        </div>

        <div className="ftm-coach-card">
          <h2 className="ftm-coach-h2">Snelkoppelingen</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a
              className="ftm-coach-btn"
              href="/creator/queue"
              style={{ textDecoration: "none" }}
            >
              Creator Queue
            </a>
            <a
              className="ftm-coach-btn ftm-coach-btn-dark"
              href="/creator/users"
              style={{ textDecoration: "none" }}
            >
              Known users
            </a>
            <a
              className="ftm-coach-btn ftm-coach-btn-dark"
              href="/creator/usage"
              style={{ textDecoration: "none" }}
            >
              Usage dashboard
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
