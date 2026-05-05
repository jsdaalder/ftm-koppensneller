import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mammoth from "mammoth";

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const ARCHIVE = path.join(ROOT, "archive", "deprecated_pre_next", "guidelines");
const OUT_DIR = path.join(ROOT, "content", "docs");

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/\.([a-z0-9]+)$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function docxToMarkdown(fp) {
  const res = await mammoth.extractRawText({ path: fp });
  const text = (res.value || "").trim();
  return text ? text : "(No text extracted from DOCX.)";
}

async function pdfToMarkdown(fp) {
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", fp, "-"], {
      maxBuffer: 50 * 1024 * 1024,
    });
    const text = String(stdout || "").trim();
    const signal = text.replace(/[\s!\f]+/g, "").trim();
    if (!text || signal.length < 40) return "(No text extracted from PDF.)";
    return text;
  } catch {
    return "(PDF conversion failed. Install poppler/pdftotext or convert manually.)";
  }
}

async function mdPassthrough(fp) {
  return (await readFile(fp, "utf8")).trim();
}

async function writeDoc({ title, slug, sourcePath, body }) {
  const outPath = path.join(OUT_DIR, `${slug}.md`);
  const content = [
    `# ${title}`,
    "",
    `Bron: \`${sourcePath.replace(ROOT + path.sep, "")}\``,
    "",
    body,
    "",
  ].join("\n");
  await writeFile(outPath, content, "utf8");
  return outPath;
}

async function main() {
  await ensureDir(OUT_DIR);

  const ftmStyleDir = path.join(ARCHIVE, "ftm_styleguide");
  const genericDir = path.join(ARCHIVE, "generic_headline_guides");
  const extraDir = path.join(ARCHIVE, "extra_docs");

  // 1) FTM style guide bundle
  const ftmDocx = path.join(ftmStyleDir, "FTM_stijlgids.docx");
  const ftmChecklist = path.join(ftmStyleDir, "FTM Koppenchecklist.md");
  const koppensnellenPdf = path.join(ftmStyleDir, "Koppensnellen.pdf");

  const ftmDocxMd = await docxToMarkdown(ftmDocx);
  const ftmChecklistMd = await mdPassthrough(ftmChecklist);
  const koppensnellenMd = await pdfToMarkdown(koppensnellenPdf);

  await writeDoc({
    title: "FTM-stijlgids",
    slug: "ftm-stijlgids",
    sourcePath: ftmDocx,
    body: [ftmDocxMd, "", "---", "", "## FTM Koppenchecklist", "", ftmChecklistMd, "", "---", "", "## Koppensnellen", "", koppensnellenMd].join("\n"),
  });

  // 2) Generic headline guides bundle
  const clichePdf = path.join(genericDir, "Comite Cliche Weg Ermee-1.pdf");
  const genericReadme = path.join(genericDir, "README.md");
  const clicheMd = await pdfToMarkdown(clichePdf);
  const genericReadmeMd = await mdPassthrough(genericReadme);
  const clicheBody =
    clicheMd === "(No text extracted from PDF.)"
      ? [
          genericReadmeMd,
          "",
          "---",
          "",
          "## Status",
          "",
          "Deze PDF bevat (waarschijnlijk) gescande pagina's of tekst als afbeelding. Met `pdftotext` konden we geen leesbare tekst extraheren.",
          "",
          "## Volgende stap (OCR)",
          "",
          "Als je dit document als doorzoekbare tekst wilt, is OCR nodig. Dan kunnen we deze Markdown automatisch aanvullen met de volledige inhoud en kan het promptprofiel het document ook goed meenemen.",
        ].join("\n")
      : [genericReadmeMd, "", "---", "", clicheMd].join("\n");
  await writeDoc({
    title: "Generieke headline-richtlijnen",
    slug: "generieke-headline-richtlijnen",
    sourcePath: clichePdf,
    body: clicheBody,
  });

  // 2b) Alternate cliche guide (scanned PDF in archive)
  const clichePdfAlt = path.join(ftmStyleDir, "Comite_Cliche_Weg_Ermee.pdf");
  const clicheAltMd = await pdfToMarkdown(clichePdfAlt);
  const clicheAltBody =
    clicheAltMd === "(No text extracted from PDF.)"
        ? [
          "## Status",
          "",
          "Deze PDF bevat (waarschijnlijk) gescande pagina's of tekst als afbeelding. Met `pdftotext` konden we geen leesbare tekst extraheren.",
          "",
          "## Volgende stap (OCR)",
          "",
          "Als je dit document als doorzoekbare tekst wilt, is OCR nodig. Dan kunnen we deze Markdown automatisch aanvullen met de volledige inhoud en kan het promptprofiel het document ook goed meenemen.",
        ].join("\n")
      : clicheAltMd;
  await writeDoc({
    title: "Comite Cliche Weg Ermee",
    slug: "comite-cliche-weg-ermee",
    sourcePath: clichePdfAlt,
    body: clicheAltBody,
  });

  // 3) Extra docs (start with README, add index of filenames)
  const extraReadme = path.join(extraDir, "README.md");
  const extraReadmeMd = await mdPassthrough(extraReadme);
  const socialDir = path.join(extraDir, "social_texts");
  // Keep it lightweight: list filenames rather than embedding all DOCX content.
  const socialFiles = [
    "Socials 1 t_m 12 november.docx",
    "Socials 2 t_m 14 april.docx",
    "Socials 2 t_m 18 februari.docx",
    "Socials 2 tot 14 oktober.docx",
    "Socials 4 tm 16 sep.docx",
    "Socials 9 t_m 21 januari.docx",
    "Socials 13 t_m 26 november.docx",
    "Socials 17 t_m 28 april.docx",
    "Socials 21 februari t_m 3 maart.docx",
    "Socials 23 t_m 30 september.docx",
    "Socials_nieuwsbrieven 12 t_m 24 juli.docx",
    "Socialteksten 6 maart t_m 1 april.docx",
  ];
  const socialIndex = [
    "## Social texts (archief)",
    "",
    "Deze bestanden staan nog als `.docx` in het archief. Indien gewenst kunnen we ze later ook converteren naar Markdown.",
    "",
    ...socialFiles.map((f) => `- \`${path.join(socialDir, f).replace(ROOT + path.sep, "")}\``),
  ].join("\n");

  await writeDoc({
    title: "Aanvullende gidsdocumenten",
    slug: "aanvullende-gidsdocumenten",
    sourcePath: extraReadme,
    body: [extraReadmeMd, "", "---", "", socialIndex].join("\n"),
  });

  // Copy over original README files (optional) as separate docs for completeness
  const ftmReadme = path.join(ftmStyleDir, "README.md");
  await copyFile(ftmReadme, path.join(OUT_DIR, "ftm-styleguide-readme.md"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
