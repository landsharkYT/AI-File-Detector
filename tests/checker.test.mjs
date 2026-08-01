import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { commit, createRepository, jsonCheck, temporaryDirectory, write } from "./helpers.mjs";

test("clean repositories are compliant", () => {
  const root = createRepository();
  write(root, "src/index.ts");
  commit(root);
  const { status, report } = jsonCheck(root);
  assert.equal(status, 0);
  assert.equal(report.result, "compliant");
  assert.equal(report.summary.total, 0);
});

test("tracked, unignored, and unprotected-directory findings are distinct", () => {
  const root = createRepository();
  write(root, "AGENTS.md");
  commit(root, "tracked agent", ["AGENTS.md"]);
  write(root, ".gitignore", "AGENTS.md\n");
  write(root, "nested/CLAUDE.md");
  mkdirSync(join(root, ".claude"));

  const { status, report } = jsonCheck(root);
  assert.equal(status, 1);
  const tracked = report.findings.find(({ type, path }) => type === "tracked" && path === "AGENTS.md");
  assert.equal(tracked.ignored, true);
  assert.equal(tracked.ignoreRule.pattern, "AGENTS.md");
  assert.ok(report.findings.some(({ type, path }) => type === "unignored" && path === "nested/CLAUDE.md"));
  assert.ok(report.findings.some(({ type, path }) => type === "unprotected-directory" && path === ".claude"));
});

test("ignored untracked artifacts are compliant", () => {
  const root = createRepository();
  write(root, ".gitignore", "AGENTS.md\n.claude/\n");
  write(root, "AGENTS.md");
  write(root, ".claude/settings.json");
  commit(root, "ignore rules");
  const { status, report } = jsonCheck(root);
  assert.equal(status, 0);
  assert.equal(report.findings.length, 0);
});

test("safe fix creates a minimal gitignore and rescans", () => {
  const root = createRepository();
  write(root, "nested/AGENTS.md");
  mkdirSync(join(root, ".claude"));
  const { status, report } = jsonCheck(root, ["--fix"]);
  assert.equal(status, 0);
  assert.equal(report.result, "compliant");
  assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), "/.claude/\n/nested/AGENTS.md\n");
});

test("safe fix appends without rewriting existing content", () => {
  const root = createRepository();
  write(root, ".gitignore", "dist/\n# keep this comment");
  write(root, "AGENTS.md");
  const before = readFileSync(join(root, ".gitignore"), "utf8");
  const { status } = jsonCheck(root, ["--fix"]);
  assert.equal(status, 0);
  const after = readFileSync(join(root, ".gitignore"), "utf8");
  assert.ok(after.startsWith(`${before}\n`));
  assert.ok(after.endsWith("/AGENTS.md\n"));
});

test("fix refuses negations and tracked artifacts", () => {
  const negated = createRepository();
  write(negated, ".gitignore", "*\n!AGENTS.md\n");
  write(negated, "AGENTS.md");
  const original = readFileSync(join(negated, ".gitignore"), "utf8");
  const negatedResult = jsonCheck(negated, ["--fix"]);
  assert.equal(negatedResult.status, 1);
  assert.equal(readFileSync(join(negated, ".gitignore"), "utf8"), original);

  const tracked = createRepository();
  write(tracked, "AGENTS.md");
  commit(tracked, "tracked", ["AGENTS.md"]);
  const trackedResult = jsonCheck(tracked, ["--fix"]);
  assert.equal(trackedResult.status, 1);
  assert.equal(existsSync(join(tracked, ".gitignore")), false);
});

test("symlinks are classified by link path and never followed", () => {
  const root = createRepository();
  const outside = temporaryDirectory("aifd-outside-");
  write(outside, "AGENTS.md");
  symlinkSync(join(outside, "AGENTS.md"), join(root, "shared-config"));
  symlinkSync(outside, join(root, ".claude"));
  const { report } = jsonCheck(root);
  assert.ok(report.findings.some(({ path, ruleId }) => path === ".claude" && ruleId === "claude.directory"));
  assert.equal(report.findings.some(({ path }) => path === "shared-config"), false);
});

test("NUL-safe scanning handles spaces, newlines, Unicode, and leading dashes", () => {
  const root = createRepository();
  const paths = ["space dir/AGENTS.md", "line\nbreak/AGENTS.md", "日本語/AGENTS.md", "-dash/AGENTS.md"];
  for (const path of paths) write(root, path);
  commit(root, "hostile names", paths);
  const { report } = jsonCheck(root);
  const found = new Set(report.findings.filter(({ type }) => type === "tracked").map(({ path }) => path));
  assert.deepEqual(found, new Set(paths));
});
