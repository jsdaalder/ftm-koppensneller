import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound, redirect } from "next/navigation";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { getLatestApprovedFeedbackExport } from "@/lib/server/approved_feedback_export";
import { getActiveProfile } from "@/lib/server/profiles";
import { requireCreator, requireUser } from "@/lib/server/auth";
import ApprovedFeedbackActions from "./ApprovedFeedbackActions";

export const runtime = "nodejs";

async function renderMarkdown(md: string): Promise<string> {
  const file = await remark()
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(md);
  return String(file);
}

export default async function DocPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const user = await requireUser();

  let md = "";
  if (slug === "super-prompt") {
    const active = await getActiveProfile();
    md = active.prompt_markdown;
  } else if (slug === "approved-user-feedback") {
    try {
      await requireCreator(user.id);
    } catch {
      redirect("/app");
    }
    const latest = await getLatestApprovedFeedbackExport();
    if (!latest) {
      md = [
        "# Approved User Feedback",
        "",
        "Er is nog geen export beschikbaar.",
        "",
        "Creator: ga naar `/creator` en genereer een export, of wacht op de cron job.",
      ].join("\n");
    } else {
      md = latest.markdown_text;
    }
  } else {
    const fp = path.join(process.cwd(), "content", "docs", `${slug}.md`);
    try {
      md = await readFile(fp, "utf8");
    } catch {
      notFound();
    }
  }
  const html = await renderMarkdown(md);
  return (
    <main className="ftm-tool-shell">
      <section className="ftm-tool-panel">
        <div className="ftm-coach-card">
          <div className="ftm-coach-row">
            <a className="ftm-coach-btn ftm-coach-btn-dark" href="/docs" style={{ textDecoration: "none" }}>
              Terug naar docs
            </a>
            <a className="ftm-coach-btn ftm-coach-btn-dark" href="/app" style={{ textDecoration: "none" }}>
              Terug naar app
            </a>
            {slug === "super-prompt" ? (
              <a
                className="ftm-coach-btn ftm-coach-btn-dark"
                href="/api/profile/active?format=md"
                style={{ marginLeft: "auto", textDecoration: "none", opacity: 0.85 }}
              >
                Download raw .md
              </a>
            ) : null}
          </div>
        </div>
        {slug === "approved-user-feedback" ? (
          <div className="ftm-coach-card">
            <ApprovedFeedbackActions />
          </div>
        ) : null}
        <article className="ftm-coach-card">
          <div className="ftm-doc-prose" dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </section>
    </main>
  );
}
