import { readdir } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

type DocItem = { slug: string; title: string };

async function listDocs(): Promise<DocItem[]> {
  const dir = path.join(process.cwd(), "content", "docs");
  const files = await readdir(dir).catch(() => []);
  const mdFiles = files.filter((f) => f.endsWith(".md"));
  const items: DocItem[] = [];
  for (const f of mdFiles) {
    const slug = f.replace(/\.md$/, "");
    const title = slug.replace(/-/g, " ");
    items.push({ slug, title });
  }
  const pinned = [
    "super-prompt",
    "ftm-stijlgids",
    "comite-cliche-weg-ermee",
    "ftm-koppenchecklist",
    "approved-user-feedback",
  ];
  const pinRank = new Map(pinned.map((s, i) => [s, i]));
  return items.sort((a, b) => {
    const ra = pinRank.has(a.slug) ? (pinRank.get(a.slug) as number) : 999;
    const rb = pinRank.has(b.slug) ? (pinRank.get(b.slug) as number) : 999;
    if (ra !== rb) return ra - rb;
    return a.slug.localeCompare(b.slug);
  });
}

export default async function DocsIndexPage() {
  const docs = await listDocs();
  return (
    <main className="ftm-tool-shell">
      <section className="ftm-tool-panel">
        <div className="ftm-coach-card">
          <div className="ftm-coach-row">
            <h1 className="ftm-coach-h1">Docs</h1>
            <a className="ftm-coach-btn ftm-coach-btn-dark" href="/app" style={{ textDecoration: "none" }}>
              Terug naar app
            </a>
          </div>
          <p className="ftm-coach-meta">Richtlijnen en gidsdocumenten (Markdown, in-repo).</p>
        </div>

        <div className="ftm-coach-card">
          <ul className="ftm-doc-list">
            {docs.map((d) => (
              <li key={d.slug}>
                <a href={`/docs/${d.slug}`}>{d.title}</a>
              </li>
            ))}
            {docs.length === 0 && <li className="ftm-coach-meta">Geen docs gevonden.</li>}
          </ul>
        </div>
      </section>
    </main>
  );
}
