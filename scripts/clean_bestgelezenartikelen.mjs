import fs from "node:fs";
import path from "node:path";

function decodeMaybeUtf16Le(buffer) {
  const looksUtf16Le = buffer.subarray(0, 200).includes(0);
  if (!looksUtf16Le) return buffer.toString("utf8");
  return new TextDecoder("utf-16le").decode(buffer);
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function normalizeLabel(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  // Sometimes Matomo exports full URLs; keep only path+query.
  try {
    if (s.startsWith("http://") || s.startsWith("https://")) {
      const u = new URL(s);
      return (u.pathname || "/") + (u.search || "");
    }
  } catch {
    // fall through
  }
  return s;
}

function stripQueryAndFragment(p) {
  const q = p.indexOf("?");
  const h = p.indexOf("#");
  let end = p.length;
  if (q !== -1) end = Math.min(end, q);
  if (h !== -1) end = Math.min(end, h);
  return p.slice(0, end);
}

function headlineFromSlug(slug) {
  const decoded = decodeURIComponent(slug);
  const words = decoded
    .split("-")
    .map((w) => w.trim())
    .filter(Boolean);
  const phrase = words.join(" ").replace(/\s+/g, " ").trim();
  if (!phrase) return "";
  return phrase[0].toUpperCase() + phrase.slice(1);
}

function classifyArticlePath(label) {
  const p = stripQueryAndFragment(label);
  const trimmed = p.replace(/\/+$/, "");
  if (trimmed.startsWith("/artikelen/")) return { kind: "artikelen", slug: trimmed.slice("/artikelen/".length) };
  if (trimmed.startsWith("/nieuwsbrieven/")) return { kind: "nieuwsbrieven", slug: trimmed.slice("/nieuwsbrieven/".length) };
  return null;
}

function toInt(value) {
  const n = Number(String(value ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function main() {
  const input = process.argv[2] || "content/training/bestgelezenartikelen/best_gelezen_afgelopen_jaar.csv";
  const outDir = process.argv[3] || path.dirname(input);

  const buf = fs.readFileSync(input);
  let text = decodeMaybeUtf16Le(buf);
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim().length);
  if (lines.length < 2) throw new Error(`No data rows found in ${input}`);

  const header = splitCsvLine(lines[0]);
  const labelIdx = header.findIndex((h) => h.trim().toLowerCase() === "label");
  const uniqueIdx = header.findIndex((h) => h.trim().toLowerCase() === "unique pageviews");
  if (labelIdx === -1 || uniqueIdx === -1) {
    throw new Error(`Could not find required headers (Label, Unique Pageviews) in ${input}`);
  }

  const kept = [];
  const dropped = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const labelRaw = cols[labelIdx];
    const label = normalizeLabel(labelRaw);
    const uniquePageviews = toInt(cols[uniqueIdx]);
    const cls = classifyArticlePath(label);
    if (!cls || !cls.slug || !/^[a-z0-9\-]+$/i.test(cls.slug)) {
      dropped.push({ label, uniquePageviews });
      continue;
    }
    kept.push({
      url: stripQueryAndFragment(label).replace(/\/+$/, ""),
      unique_pageviews: uniquePageviews,
      kind: cls.kind,
      slug: cls.slug,
      headline: headlineFromSlug(cls.slug),
    });
  }

  kept.sort((a, b) => b.unique_pageviews - a.unique_pageviews);

  fs.mkdirSync(outDir, { recursive: true });
  const outCsv = path.join(outDir, "best_gelezen_afgelopen_jaar.cleaned.csv");
  const outMd = path.join(outDir, "best_gelezen_afgelopen_jaar.cleaned.md");
  const outDropped = path.join(outDir, "best_gelezen_afgelopen_jaar.dropped.csv");

  const csvLines = [
    ["url", "unique_pageviews", "kind", "headline", "slug"].map(csvEscape).join(","),
    ...kept.map((r) => [r.url, r.unique_pageviews, r.kind, r.headline, r.slug].map(csvEscape).join(",")),
  ];
  fs.writeFileSync(outCsv, csvLines.join("\n") + "\n");

  const mdLines = [
    "# Best gelezen artikelen (cleaned)",
    "",
    `Bron: \`${path.basename(input)}\``,
    "",
    `Totaal rijen in export: ${lines.length - 1}`,
    `Overgehouden (artikelen/nieuwsbrieven): ${kept.length}`,
    `Gefilterd (non-article/overig): ${dropped.length}`,
    "",
    "## Lijst (op Unique Pageviews)",
    "",
    ...kept.map((r, idx) => `${idx + 1}. ${r.unique_pageviews} — ${r.headline} (${r.url})`),
    "",
  ];
  fs.writeFileSync(outMd, mdLines.join("\n"));

  const droppedLines = [
    ["label", "unique_pageviews"].map(csvEscape).join(","),
    ...dropped
      .sort((a, b) => b.uniquePageviews - a.uniquePageviews)
      .map((r) => [r.label, r.uniquePageviews].map(csvEscape).join(",")),
  ];
  fs.writeFileSync(outDropped, droppedLines.join("\n") + "\n");

  console.log(
    JSON.stringify(
      {
        input,
        outCsv,
        outMd,
        outDropped,
        total_rows: lines.length - 1,
        kept: kept.length,
        dropped: dropped.length,
      },
      null,
      2,
    ),
  );
}

main();

