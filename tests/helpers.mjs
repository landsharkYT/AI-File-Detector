import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

export const projectRoot = resolve(import.meta.dirname, "..");
export const cliPath = join(projectRoot, "dist", "ai-file-detector.js");

export function temporaryDirectory(prefix = "aifd-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function git(root, args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options
  });
  if (result.status !== 0 && options.allowFailure !== true) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result;
}

export function createRepository() {
  const root = temporaryDirectory();
  git(root, ["init", "-q", "--initial-branch=main"]);
  git(root, ["config", "user.name", "AIFileDetector Tests"]);
  git(root, ["config", "user.email", "tests@example.invalid"]);
  return root;
}

export function write(root, path, content = "fixture\n") {
  const target = join(root, ...path.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
  return target;
}

export function commit(root, message = "fixture", forcePaths = []) {
  git(root, ["add", "-A"]);
  if (forcePaths.length > 0) git(root, ["add", "-f", "--", ...forcePaths]);
  git(root, ["commit", "-q", "--allow-empty", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]).stdout.trim();
}

export function runCli(root, args = [], environment = {}) {
  const env = { ...process.env, ...environment };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
}

export function jsonCheck(root, args = [], environment = {}) {
  const result = runCli(root, ["check", "--format", "json", ...args], environment);
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Invalid JSON output (${error.message}):\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  }
  return { ...result, report };
}
