import { spawnSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import type { IgnoreRule, PullRequestContext } from "./types.js";
import { normalizeRepositoryPath } from "./paths.js";

export class GitError extends Error {
  readonly code = "GIT_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

interface GitResult {
  readonly status: number;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}

function execute(cwd: string, args: readonly string[], input?: Buffer): GitResult {
  const result = spawnSync("git", args, {
    cwd,
    input,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error !== undefined) throw new GitError(`Unable to execute Git: ${result.error.message}`);
  if (result.status === null) throw new GitError("Git terminated without an exit status");
  return {
    status: result.status,
    stdout: result.stdout ?? Buffer.alloc(0),
    stderr: result.stderr ?? Buffer.alloc(0)
  };
}

function requireSuccess(cwd: string, args: readonly string[], input?: Buffer): Buffer {
  const result = execute(cwd, args, input);
  if (result.status !== 0) {
    const detail = result.stderr.toString("utf8").trim();
    throw new GitError(detail === "" ? `git ${args[0] ?? "command"} failed` : detail);
  }
  return result.stdout;
}

function nulValues(buffer: Buffer): string[] {
  if (buffer.length === 0) return [];
  const values = buffer.toString("utf8").split("\0");
  if (values.at(-1) === "") values.pop();
  return values;
}

function nulInput(paths: readonly string[]): Buffer {
  return Buffer.from(`${paths.join("\0")}\0`, "utf8");
}

export function findGitRoot(start: string): string {
  return requireSuccess(start, ["rev-parse", "--show-toplevel"]).toString("utf8").trimEnd();
}

export function listTracked(root: string): string[] {
  return nulValues(requireSuccess(root, ["ls-files", "-z"])).map(normalizeRepositoryPath);
}

export function listUntracked(root: string): string[] {
  return nulValues(requireSuccess(root, ["ls-files", "--others", "--exclude-standard", "-z"]))
    .map(normalizeRepositoryPath);
}

interface RawIgnoreRule extends IgnoreRule {
  readonly ignored: boolean;
}

export function checkIgnore(root: string, paths: readonly string[]): ReadonlyMap<string, RawIgnoreRule> {
  if (paths.length === 0) return new Map();
  const result = execute(root, ["check-ignore", "--no-index", "-v", "-z", "--stdin"], nulInput(paths));
  if (result.status !== 0 && result.status !== 1) {
    const detail = result.stderr.toString("utf8").trim();
    throw new GitError(detail === "" ? "git check-ignore failed" : detail);
  }

  const fields = nulValues(result.stdout);
  if (fields.length % 4 !== 0) throw new GitError("Unexpected git check-ignore output");
  const matches = new Map<string, RawIgnoreRule>();
  for (let index = 0; index < fields.length; index += 4) {
    const sourceValue = fields[index] ?? "";
    const sourceAbsolute = sourceValue === "" ? "" : isAbsolute(sourceValue) ? sourceValue : resolve(root, sourceValue);
    const source = sourceAbsolute === "" ? "" : normalizeRepositoryPath(relative(root, sourceAbsolute));
    const pattern = fields[index + 2] ?? "";
    const path = normalizeRepositoryPath(fields[index + 3] ?? "");
    matches.set(path, {
      source: source === "" || source.startsWith("../") ? ".git/external-ignore" : source,
      line: Number.parseInt(fields[index + 1] ?? "0", 10) || 0,
      pattern,
      ignored: !pattern.startsWith("!")
    });
  }
  return matches;
}

function validateObjectId(value: string): void {
  if (!/^[0-9a-f]{40,64}$/iu.test(value)) throw new GitError("Pull request object IDs are invalid");
}

export function verifyCommit(root: string, objectId: string): void {
  validateObjectId(objectId);
  const result = execute(root, ["cat-file", "-e", `${objectId}^{commit}`]);
  if (result.status !== 0) {
    throw new GitError("The pull request base commit is unavailable; checkout with fetch-depth: 0");
  }
}

export function readFileAtCommit(root: string, objectId: string, path: string): string | null {
  verifyCommit(root, objectId);
  const exists = execute(root, ["cat-file", "-e", `${objectId}:${path}`]);
  if (exists.status !== 0) return null;
  return requireSuccess(root, ["show", `${objectId}:${path}`]).toString("utf8");
}

function changedPaths(root: string, context: PullRequestContext, filter: string): Set<string> {
  validateObjectId(context.base);
  validateObjectId(context.head);
  const output = requireSuccess(root, [
    "diff",
    "--name-only",
    "-z",
    `--diff-filter=${filter}`,
    context.base,
    context.head,
    "--"
  ]);
  return new Set(nulValues(output).map(normalizeRepositoryPath));
}

export function pullRequestChanges(root: string, context: PullRequestContext): {
  readonly added: ReadonlySet<string>;
  readonly modified: ReadonlySet<string>;
} {
  verifyCommit(root, context.base);
  verifyCommit(root, context.head);
  return {
    added: changedPaths(root, context, "A"),
    modified: changedPaths(root, context, "MCRT")
  };
}
