import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { commit, createRepository, projectRoot, temporaryDirectory, write } from "./helpers.mjs";

const installerPath = join(projectRoot, "skills", "ai-file-detector", "scripts", "install.mjs");
const bundledCheckerPath = join(projectRoot, "dist", "ai-file-detector.js");
const installedSkillPath = ".agents/skills/ai-file-detector";

function install(root) {
  return spawnSync(process.execPath, [installerPath, "--root", root], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
}

test("the skill installs a repository-local copy and safely appends its ignore rule", () => {
  const root = createRepository();
  write(root, ".gitignore", "dist/\n# preserve me");
  write(root, "README.md");
  commit(root);

  const result = install(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /installed/u);
  assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), "dist/\n# preserve me\n/.agents/\n");
  assert.equal(
    readFileSync(join(root, installedSkillPath, "SKILL.md"), "utf8"),
    readFileSync(join(projectRoot, "skills", "ai-file-detector", "SKILL.md"), "utf8")
  );
  assert.equal(
    readFileSync(join(root, installedSkillPath, "bin", "ai-file-detector.mjs"), "utf8"),
    readFileSync(bundledCheckerPath, "utf8")
  );

  const check = spawnSync(process.execPath, [join(root, installedSkillPath, "bin", "ai-file-detector.mjs"), "check", "--root", root, "--format", "json"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(check.status, 0, check.stderr);
  assert.equal(JSON.parse(check.stdout).result, "compliant");
});

test("installation is idempotent and preserves an existing covering ignore rule", () => {
  const root = createRepository();
  write(root, ".gitignore", ".agents/\n");
  const original = readFileSync(join(root, ".gitignore"), "utf8");

  assert.equal(install(root).status, 0);
  const second = install(root);

  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /already installed/u);
  assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), original);
});

test("an installed skill can install itself into another repository", () => {
  const source = createRepository();
  assert.equal(install(source).status, 0);
  const installedInstaller = join(source, installedSkillPath, "scripts", "install.mjs");
  const target = createRepository();

  const result = spawnSync(process.execPath, [installedInstaller, "--root", target], {
    cwd: target,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(target, ".gitignore"), "utf8"), "/.agents/\n");
  assert.equal(
    readFileSync(join(target, installedSkillPath, "bin", "ai-file-detector.mjs"), "utf8"),
    readFileSync(bundledCheckerPath, "utf8")
  );
});

test("installation refuses to overwrite a conflicting skill", () => {
  const root = createRepository();
  write(root, ".gitignore", ".agents/\n");
  write(root, `${installedSkillPath}/SKILL.md`, "user-owned skill\n");

  const result = install(root);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /refusing to overwrite/u);
  assert.equal(readFileSync(join(root, installedSkillPath, "SKILL.md"), "utf8"), "user-owned skill\n");
  assert.equal(existsSync(join(root, installedSkillPath, "scripts", "install.mjs")), false);
});

test("installation refuses tracked .agents content", () => {
  const root = createRepository();
  write(root, ".agents/existing.txt");
  commit(root, "tracked agent state", [".agents/existing.txt"]);

  const result = install(root);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /tracked/u);
  assert.equal(existsSync(join(root, ".gitignore")), false);
  assert.equal(existsSync(join(root, installedSkillPath, "SKILL.md")), false);
});

test("installation refuses a negation that exposes the target skill", () => {
  const root = createRepository();
  write(root, ".gitignore", "/.agents/\n!/.agents/\n!/.agents/**\n");
  const original = readFileSync(join(root, ".gitignore"), "utf8");

  const result = install(root);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /negation/u);
  assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), original);
  assert.equal(existsSync(join(root, installedSkillPath, "SKILL.md")), false);
});

test("installation refuses non-regular gitignore files and symlinked target directories", () => {
  const nonRegular = createRepository();
  mkdirSync(join(nonRegular, ".gitignore"));
  const nonRegularResult = install(nonRegular);
  assert.equal(nonRegularResult.status, 2);
  assert.match(nonRegularResult.stderr, /not a regular file/u);
  assert.equal(existsSync(join(nonRegular, installedSkillPath, "SKILL.md")), false);

  const linked = createRepository();
  const outside = temporaryDirectory("aifd-installer-outside-");
  symlinkSync(outside, join(linked, ".agents"));
  const linkedResult = install(linked);
  assert.equal(linkedResult.status, 2);
  assert.match(linkedResult.stderr, /symbolic link/u);
  assert.equal(existsSync(join(outside, "skills")), false);

  const dangling = createRepository();
  symlinkSync(join(outside, "missing"), join(dangling, ".agents"));
  const danglingResult = install(dangling);
  assert.equal(danglingResult.status, 2);
  assert.match(danglingResult.stderr, /symbolic link/u);
  assert.equal(existsSync(join(dangling, ".gitignore")), false);
});
