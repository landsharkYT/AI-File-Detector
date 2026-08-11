import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { checkIgnore, listTracked, listUntracked, pullRequestChanges } from "./git.js";
import { isExempt } from "./policy.js";
import { asciiLower, normalizeRepositoryPath } from "./paths.js";
import { resolveDirectoryRule, resolveRule } from "./rules.js";
import type {
  Finding,
  IgnoreRule,
  Policy,
  PullRequestContext,
  PullRequestRelation,
  Report,
  RuleMatch
} from "./types.js";

interface CheckOptions {
  readonly root: string;
  readonly policy: Policy;
  readonly pullRequest?: PullRequestContext;
}

function publicIgnoreRule(value: { readonly source: string; readonly line: number; readonly pattern: string } | undefined): IgnoreRule | null {
  return value === undefined ? null : { source: value.source, line: value.line, pattern: value.pattern };
}

function relationFor(
  path: string,
  artifactRoot: string,
  changes: { readonly added: ReadonlySet<string>; readonly modified: ReadonlySet<string> } | null
): PullRequestRelation {
  if (changes === null) return "not-applicable";
  if (changes.added.has(path)) return "added";
  if (changes.modified.has(path)) return "modified";
  for (const candidate of changes.added) {
    if (asciiLower(candidate).startsWith(`${asciiLower(artifactRoot)}/`)) return "added";
  }
  for (const candidate of changes.modified) {
    if (asciiLower(candidate).startsWith(`${asciiLower(artifactRoot)}/`)) return "modified";
  }
  return "pre-existing";
}

async function protectedDirectories(root: string): Promise<readonly { readonly path: string; readonly match: RuleMatch }[]> {
  let pending = [""];
  const found: { path: string; match: RuleMatch }[] = [];

  while (pending.length > 0) {
    const next: string[] = [];
    for (const parent of pending) {
      const entries = await readdir(join(root, parent), { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        if (asciiLower(entry.name) === ".git") continue;
        const path = normalizeRepositoryPath(parent === "" ? entry.name : `${parent}/${entry.name}`);
        const match = resolveDirectoryRule(path);
        if (match !== null) {
          found.push({ path, match });
          continue;
        }
        next.push(path);
      }
    }

    const ignored = checkIgnore(root, next.map((path) => `${path}/`));
    pending = next.filter((path) => {
      const match = ignored.get(`${path}/`) ?? ignored.get(path);
      return match === undefined || !match.ignored;
    });
  }
  return found;
}

export async function checkRepository(options: CheckOptions): Promise<Report> {
  const { root, policy } = options;
  const changes = options.pullRequest === undefined ? null : pullRequestChanges(root, options.pullRequest);
  const tracked = listTracked(root);
  const untracked = listUntracked(root);
  const trackedIgnoreRules = checkIgnore(root, tracked);
  const untrackedIgnoreRules = checkIgnore(root, untracked);
  const findings: Finding[] = [];

  for (const path of tracked) {
    const match = resolveRule(path);
    if (match === null || isExempt(policy, match.rule.id, path, match.artifactRoot)) continue;
    const ignoreRule = trackedIgnoreRules.get(path);
    findings.push({
      type: "tracked",
      ruleId: match.rule.id,
      path,
      artifactRoot: match.artifactRoot,
      ignored: ignoreRule?.ignored ?? false,
      ignoreRule: publicIgnoreRule(ignoreRule),
      pullRequestRelation: relationFor(path, match.artifactRoot, changes),
      remediation: "untrack-and-ignore"
    });
  }

  for (const path of untracked) {
    const match = resolveRule(path);
    if (match === null || isExempt(policy, match.rule.id, path, match.artifactRoot)) continue;
    const ignoreRule = untrackedIgnoreRules.get(path);
    findings.push({
      type: "unignored",
      ruleId: match.rule.id,
      path,
      artifactRoot: match.artifactRoot,
      ignored: false,
      ignoreRule: publicIgnoreRule(ignoreRule),
      pullRequestRelation: relationFor(path, match.artifactRoot, changes),
      remediation: "add-ignore"
    });
  }

  const directories = await protectedDirectories(root);
  const probes = directories.map(({ path }) => `${path}/.ai-file-detector-probe`);
  const probeRules = checkIgnore(root, probes);
  for (let index = 0; index < directories.length; index += 1) {
    const directory = directories[index];
    const probe = probes[index];
    if (directory === undefined || probe === undefined) continue;
    if (isExempt(policy, directory.match.rule.id, directory.path, directory.match.artifactRoot)) continue;
    const ignoreRule = probeRules.get(probe);
    if (ignoreRule?.ignored === true) continue;
    findings.push({
      type: "unprotected-directory",
      ruleId: directory.match.rule.id,
      path: directory.path,
      artifactRoot: directory.match.artifactRoot,
      ignored: false,
      ignoreRule: publicIgnoreRule(ignoreRule),
      pullRequestRelation: relationFor(directory.path, directory.match.artifactRoot, changes),
      remediation: "protect-directory"
    });
  }

  findings.sort((left, right) => left.path.localeCompare(right.path) || left.ruleId.localeCompare(right.ruleId) || left.type.localeCompare(right.type));
  const trackedCount = findings.filter(({ type }) => type === "tracked").length;
  const unignoredCount = findings.filter(({ type }) => type === "unignored").length;
  const unprotectedDirectories = findings.filter(({ type }) => type === "unprotected-directory").length;
  return {
    schemaVersion: 2,
    result: findings.length === 0 ? "compliant" : "violations",
    exitCode: findings.length === 0 ? 0 : 1,
    policy: { source: policy.source, path: ".ai-artifact-policy.json", version: policy.version },
    summary: {
      total: findings.length,
      tracked: trackedCount,
      unignored: unignoredCount,
      unprotectedDirectories
    },
    findings,
    exemptions: policy.exemptions,
    errors: []
  };
}
