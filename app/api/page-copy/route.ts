export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

async function renderMarkdown(md: string): Promise<string> {
  const file = await remark()
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(md);
  return String(file);
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
    const html = await renderMarkdown(raw);
    if (format === "html") return NextResponse.json({ slug, format, html });
    return NextResponse.json({ slug, format, markdown: raw, html });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
