import mammoth from "mammoth";

export async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.replace(/\s+/g, " ").trim();
  if (!text) throw new Error("DOCX bevat geen leesbare tekst.");
  return text;
}
