export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

type MarkdownSection = {
  title: string;
  body: string;
};

async function renderMarkdown(md: string): Promise<string> {
  const file = await remark()
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(md);
  return String(file);
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function splitMarkdownByH2(md: string): { intro: string; sections: MarkdownSection[] } {
  const lines = md.split(/\r?\n/);
  const intro: string[] = [];
  const sections: MarkdownSection[] = [];
  let currentTitle = "";
  let currentBody: string[] = [];

  const flushSection = () => {
    if (!currentTitle) return;
    sections.push({
      title: currentTitle.trim(),
      body: currentBody.join("\n").trim(),
    });
  };

  for (const line of lines) {
    if (!currentTitle && line.startsWith("# ")) {
      // The app page already renders its own title, so the markdown H1 would duplicate it.
      continue;
    }
    if (line.startsWith("## ")) {
      flushSection();
      currentTitle = line.slice(3).trim();
      currentBody = [];
      continue;
    }
    if (currentTitle) {
      currentBody.push(line);
      continue;
    }
    intro.push(line);
  }

  flushSection();
  return {
    intro: intro.join("\n").trim(),
    sections,
  };
}

async function renderCollapsibleMarkdown(md: string): Promise<string> {
  const { intro, sections } = splitMarkdownByH2(md);
  if (sections.length === 0) return renderMarkdown(md);

  const introHtml = intro ? await renderMarkdown(intro) : "";
  const sectionHtml = await Promise.all(
    sections.map(async (section) => {
      const bodyHtml = section.body ? await renderMarkdown(section.body) : "";
      return [
        '<details class="ftm-doc-accordion">',
        `<summary>${escapeHtml(section.title)}</summary>`,
        `<div class="ftm-doc-accordion-body">${bodyHtml}</div>`,
        "</details>",
      ].join("");
    }),
  );

  return `${introHtml}${sectionHtml.join("")}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") || "").trim().toLowerCase();
  const format = (url.searchParams.get("format") || "md").trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "Invalid slug." }, { status: 400 });
  }
  if (format !== "md" && format !== "html") {
    return NextResponse.json({ error: "Invalid format." }, { status: 400 });
  }

  // Ensure the content files are included in Vercel/Next output tracing by
  // referencing them via a static allowlist.
  const allowSource: Record<string, string> = {
    app: path.join(process.cwd(), "content", "pages", "app.md"),
  };
  const fp = allowSource[slug] || "";
  if (!fp) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const raw = await readFile(fp, "utf8");
    const html = slug === "app" ? await renderCollapsibleMarkdown(raw) : await renderMarkdown(raw);
    if (format === "html") return NextResponse.json({ slug, format, html });
    return NextResponse.json({ slug, format, markdown: raw, html });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
