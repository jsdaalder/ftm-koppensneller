import { readFile } from "node:fs/promises";
import path from "node:path";

type SectionMap = Record<string, string | string[]>;
export type UiCopy = Record<string, SectionMap>;

const COPY_PATH = path.join(process.cwd(), "content", "ui_copy.md");

function parseMarkdownCopy(source: string): UiCopy {
  const lines = source.split(/\r?\n/);
  const result: UiCopy = {};
  let section = "";
  let key = "";
  const acc: string[] = [];

  const flush = () => {
    if (!section || !key) return;
    const values = acc
      .map((v) => v.trimEnd())
      .filter((v) => v.length > 0);
    if (!result[section]) result[section] = {};
    if (values.length === 0) {
      result[section][key] = "";
      return;
    }
    const listValues = values
      .filter((v) => v.startsWith("- "))
      .map((v) => v.slice(2).trim())
      .filter(Boolean);
    if (listValues.length === values.length) {
      result[section][key] = listValues;
      return;
    }
    result[section][key] = values.join("\n");
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      section = line.slice(3).trim();
      key = "";
      acc.length = 0;
      if (!result[section]) result[section] = {};
      continue;
    }
    if (line.startsWith("### ")) {
      flush();
      key = line.slice(4).trim();
      acc.length = 0;
      continue;
    }
    if (!key) continue;
    acc.push(line);
  }

  flush();
  return result;
}

export async function loadUiCopy(): Promise<UiCopy> {
  const raw = await readFile(COPY_PATH, "utf8");
  return parseMarkdownCopy(raw);
}
