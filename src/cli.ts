import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkRepository } from "./checker.js";
import { applyFixes } from "./fix.js";
import { findGitRoot, readFileAtCommit } from "./git.js";
import { emitGitHub } from "./github.js";
import { parsePolicy, readWorkingPolicy } from "./policy.js";
import { RULES } from "./rules.js";
import { errorReport, jsonReport, textReport } from "./report.js";
import type { FixResult, Policy, PullRequestContext, Report } from "./types.js";

const VERSION = "1.0.0";

interface Arguments {
  readonly command: "check" | "rules";
  readonly root: string;
  readonly format: "text" | "json";
  readonly fix: boolean;
  readonly help: boolean;
  readonly version: boolean;
}

class UsageError extends Error {
  readonly code = "INVALID_ARGUMENTS";
}

function usage(): string {
  return [
    "AIFileDetector keeps local AI-agent artifacts out of Git history.",
    "",
    "Usage:",
    "  ai-file-detector [check] [--root PATH] [--format text|json] [--fix]",
    "  ai-file-detector rules [--format text|json]",
    "  ai-file-detector --help",
    "  ai-file-detector --version",
    ""
  ].join("\n");
}

function parseArguments(values: readonly string[]): Arguments {
  let command: Arguments["command"] = "check";
  let root = process.cwd();
  let format: Arguments["format"] = "text";
  let fix = false;
  let help = false;
  let version = false;
  let commandSeen = false;
  let rootSeen = false;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) continue;
    if (value === "check" || value === "rules") {
      if (commandSeen) throw new UsageError("Only one command may be specified");
      command = value;
      commandSeen = true;
    } else if (value === "--root") {
      const next = values[index + 1];
      if (next === undefined) throw new UsageError("--root requires a path");
      root = resolve(next);
      rootSeen = true;
      index += 1;
    } else if (value === "--format") {
      const next = values[index + 1];
      if (next !== "text" && next !== "json") throw new UsageError("--format must be text or json");
      format = next;
      index += 1;
    } else if (value === "--fix") {
      fix = true;
    } else if (value === "--help" || value === "-h") {
      help = true;
    } else if (value === "--version" || value === "-v") {
      version = true;
    } else {
      throw new UsageError(`Unknown option or command ${JSON.stringify(value)}`);
    }
  }
  if (command === "rules" && (fix || rootSeen)) {
    throw new UsageError("rules accepts only --format");
  }
  return { command, root, format, fix, help, version };
}

function pullRequestContext(): PullRequestContext | null {
  if (process.env.AIFD_ACTION !== "1" || process.env.GITHUB_EVENT_NAME !== "pull_request") return null;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath === undefined) throw new UsageError("GITHUB_EVENT_PATH is required for pull requests");
  const event = JSON.parse(readFileSync(eventPath, "utf8")) as {
    pull_request?: { base?: { sha?: unknown }; head?: { sha?: unknown } };
  };
  const base = event.pull_request?.base?.sha;
  const head = event.pull_request?.head?.sha;
  if (typeof base !== "string" || typeof head !== "string") throw new UsageError("Pull request object IDs are missing");
  return { base, head };
}

function policyFor(root: string, context: PullRequestContext | null): Policy {
  if (context === null) return readWorkingPolicy(root);
  return parsePolicy(readFileAtCommit(root, context.base, ".ai-artifact-policy.json"), "base-branch");
}

function printRules(format: "text" | "json"): void {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, rules: RULES }, null, 2)}\n`);
    return;
  }
  for (const rule of RULES) process.stdout.write(`${rule.id.padEnd(28)} ${rule.pattern}\n`);
}

function emit(report: Report, format: "text" | "json", fixes?: FixResult): void {
  process.stdout.write(format === "json" ? jsonReport(report) : textReport(report, fixes));
  if (process.env.AIFD_ACTION === "1") emitGitHub(report);
}

async function main(): Promise<number> {
  let args: Arguments;
  try {
    args = parseArguments(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const report = errorReport("INVALID_ARGUMENTS", message);
    const values = process.argv.slice(2);
    const requestedJson = values.some((value, index) => value === "--format" && values[index + 1] === "json");
    if (requestedJson) process.stdout.write(jsonReport(report));
    else process.stderr.write(textReport(report));
    if (process.env.AIFD_ACTION === "1") emitGitHub(report);
    return 2;
  }
  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (args.command === "rules") {
    printRules(args.format);
    return 0;
  }

  let source: Report["policy"]["source"] = "defaults";
  try {
    const root = findGitRoot(args.root);
    const context = pullRequestContext();
    const policy = policyFor(root, context);
    source = policy.source;
    let report = await checkRepository({ root, policy, ...(context === null ? {} : { pullRequest: context }) });
    let fixes: FixResult | undefined;
    if (args.fix) {
      if (process.env.AIFD_ACTION === "1") throw new UsageError("--fix is unavailable in GitHub Actions");
      fixes = applyFixes(root, report);
      report = await checkRepository({ root, policy: readWorkingPolicy(root) });
    }
    emit(report, args.format, fixes);
    return report.exitCode;
  } catch (error) {
    const candidate = error as { code?: unknown; message?: unknown };
    const code = typeof candidate.code === "string" ? candidate.code : "EXECUTION_ERROR";
    const message = typeof candidate.message === "string" ? candidate.message : String(error);
    const report = errorReport(code, message, source);
    emit(report, args.format);
    return 2;
  }
}

process.exitCode = await main();
