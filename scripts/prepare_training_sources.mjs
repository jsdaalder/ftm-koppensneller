import { mkdir, writeFile, copyFile, rm, readdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mammoth from "mammoth";

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const ARCHIVE_BASE = path.join(ROOT, "archive", "deprecated_pre_next", "guidelines", "ftm_styleguide");
const OUT_DIR = path.join(ROOT, "content", "docs");

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

async function tesseractLang() {
  try {
    const { stdout } = await execFileAsync("tesseract", ["--list-langs"], { maxBuffer: 1024 * 1024 });
    const txt = String(stdout || "");
    return txt.includes("\nnld\n") || txt.trim().endsWith("nld") ? "nld" : "eng";
  } catch {
    return "eng";
  }
}

async function docxToText(fp) {
  const res = await mammoth.extractRawText({ path: fp });
  return String(res.value || "").trim();
}

async function pdfToOcrText(fp, lang) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "ftm_ocr_"));

  const imgPrefix = path.join(tmpDir, "page");
  // Render pages to PNG
  await execFileAsync("pdftoppm", ["-png", "-r", "200", fp, imgPrefix], { maxBuffer: 50 * 1024 * 1024 });
  const files = (await readdir(tmpDir)).filter((f) => f.endsWith(".png")).sort();
  const parts = [];
  for (const f of files) {
    const imgPath = path.join(tmpDir, f);
    const { stdout } = await execFileAsync("tesseract", [imgPath, "stdout", "-l", lang], { maxBuffer: 50 * 1024 * 1024 });
    const pageText = String(stdout || "").trim();
    parts.push(`\n\n---\n\n### ${f}\n\n${pageText}\n`);
  }
  await rm(tmpDir, { recursive: true, force: true });
  const full = parts.join("\n").trim();
  return full;
}

async function writeMd({ outSlug, title, sourcePath, body, extraMeta }) {
  const header = [
    `# ${title}`,
    "",
    `Source: \`${sourcePath.replace(ROOT + path.sep, "")}\``,
    `Converted at: \`${nowIso()}\``,
    ...(extraMeta ? [extraMeta] : []),
    "",
    "---",
    "",
  ].join("\n");
  const outPath = path.join(OUT_DIR, `${outSlug}.md`);
  await writeFile(outPath, `${header}${body.trim()}\n`, "utf8");
}

async function main() {
  await ensureDir(OUT_DIR);
  const lang = await tesseractLang();

  const ftmDocx = path.join(ARCHIVE_BASE, "FTM_stijlgids.docx");
  const comitePdf = path.join(ARCHIVE_BASE, "Comite_Cliche_Weg_Ermee.pdf");
  const checklistMd = path.join(ARCHIVE_BASE, "FTM Koppenchecklist.md");

  const ftmText = await docxToText(ftmDocx);
  await writeMd({
    outSlug: "ftm-stijlgids",
    title: "FTM-stijlgids",
    sourcePath: ftmDocx,
    body: ftmText || "(No text extracted from DOCX.)",
  });

  const comiteText = await pdfToOcrText(comitePdf, lang);
  await writeMd({
    outSlug: "comite-cliche-weg-ermee",
    title: "Comite Cliche Weg Ermee",
    sourcePath: comitePdf,
    extraMeta: `OCR language: \`${lang}\``,
    body: comiteText || "(No text extracted from PDF via OCR.)",
  });

  await copyFile(checklistMd, path.join(OUT_DIR, "ftm-koppenchecklist.md"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
