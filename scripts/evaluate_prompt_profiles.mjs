import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const ROOT = process.cwd();
const FIXTURE = path.join(ROOT, "content", "evals", "prompt-profile-regression.json");

async function readText(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function readFromGit(ref, relativePath) {
  const { stdout } = await execFile("git", ["show", `${ref}:${relativePath}`], { cwd: ROOT });
  return stdout;
}

function metrics(text) {
  const lines = text.split(/\r?\n/);
  const substantive = lines.map((line) => line.trim().replace(/\s+/g, " ")).filter((line) => line.length > 24);
  const counts = new Map();
  for (const line of substantive) counts.set(line, (counts.get(line) ?? 0) + 1);
  const duplicateLines = [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
  return {
    lines: lines.filter(Boolean).length,
    headings: lines.filter((line) => /^#{1,3} /.test(line)).length,
    duplicate_substantive_lines: duplicateLines,
  };
}

function assertIncludes(text, needles, label, failures) {
  for (const needle of needles ?? []) {
    if (!text.includes(needle)) failures.push(`${label}: missing ${JSON.stringify(needle)}`);
  }
}

function assertExcludes(text, needles, label, failures) {
  for (const needle of needles ?? []) {
    if (text.includes(needle)) failures.push(`${label}: unexpectedly contains ${JSON.stringify(needle)}`);
  }
}

async function main() {
  const beforeRefIndex = process.argv.indexOf("--before-ref");
  const beforeRef = beforeRefIndex >= 0 ? process.argv[beforeRefIndex + 1] : "HEAD";
  if (!beforeRef || beforeRef.startsWith("-")) throw new Error("Usage: node scripts/evaluate_prompt_profiles.mjs [--before-ref <git-ref>]");

  const fixture = JSON.parse(await readFile(FIXTURE, "utf8"));
  const failures = [];
  const profiles = [];

  for (const spec of fixture.profiles) {
    const pointer = JSON.parse(await readText(spec.pointer));
    const profilePath = `prompt_profiles/${pointer.profile_id}.md`;
    const before = await readFromGit(beforeRef, spec.before);
    const after = await readText(profilePath);
    assertIncludes(before, spec.beforeMustInclude, `${spec.language} before`, failures);
    assertIncludes(after, spec.mustInclude, `${spec.language} after`, failures);
    assertExcludes(after, spec.afterMustNotInclude, `${spec.language} after`, failures);
    profiles.push({
      language: spec.language,
      before: metrics(before),
      after: metrics(after),
      line_delta: metrics(after).lines - metrics(before).lines,
    });
  }

  const runtime = await readText(fixture.runtime.file);
  assertIncludes(runtime, fixture.runtime.mustInclude, "runtime", failures);
  assertExcludes(runtime, fixture.runtime.mustNotInclude, "runtime", failures);

  const result = { before_ref: beforeRef, profiles, runtime: { file: fixture.runtime.file }, passed: failures.length === 0, failures };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
