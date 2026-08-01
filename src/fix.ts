import { appendFileSync, existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Finding, FixResult, Report } from "./types.js";

function safePattern(path: string, directory: boolean): string | null {
  if (/[\u0000-\u001f\u007f]/u.test(path)) return null;
  const escaped = path
    .replaceAll("\\", "\\\\")
    .replaceAll("*", "\\*")
    .replaceAll("?", "\\?")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll(" ", "\\ ");
  return `/${escaped}${directory ? "/" : ""}`;
}

function targetFor(finding: Finding): { readonly path: string; readonly directory: boolean } {
  if (finding.type === "unprotected-directory") return { path: finding.artifactRoot, directory: true };
  if (finding.artifactRoot !== finding.path) return { path: finding.artifactRoot, directory: true };
  return { path: finding.path, directory: false };
}

export function applyFixes(root: string, report: Report): FixResult {
  const trackedRoots = new Set(
    report.findings.filter(({ type }) => type === "tracked").map(({ artifactRoot }) => artifactRoot)
  );
  const requested = new Map<string, { path: string; directory: boolean }>();
  const skipped: { path: string; reason: string }[] = [];

  for (const finding of report.findings) {
    if (finding.type === "tracked") {
      skipped.push({ path: finding.path, reason: "tracked artifacts must be untracked manually" });
      continue;
    }
    if (trackedRoots.has(finding.artifactRoot)) {
      skipped.push({ path: finding.path, reason: "the protected artifact contains tracked content" });
      continue;
    }
    if (finding.ignoreRule?.pattern.startsWith("!") === true) {
      skipped.push({ path: finding.path, reason: "an existing negation rule controls this path" });
      continue;
    }
    const target = targetFor(finding);
    const pattern = safePattern(target.path, target.directory);
    if (pattern === null) {
      skipped.push({ path: finding.path, reason: "the path cannot be represented safely in .gitignore" });
      continue;
    }
    requested.set(pattern, target);
  }

  if (requested.size === 0) return { applied: [], skipped };
  const gitignorePath = join(root, ".gitignore");
  if (existsSync(gitignorePath)) {
    const stats = lstatSync(gitignorePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      for (const { path } of requested.values()) skipped.push({ path, reason: ".gitignore is not a regular file" });
      return { applied: [], skipped };
    }
  }

  const patterns = [...requested.keys()].sort();
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `${patterns.join("\n")}\n`, { encoding: "utf8", flag: "wx" });
  } else {
    const content = readFileSync(gitignorePath);
    const prefix = content.length === 0 || content.at(-1) === 10 ? "" : "\n";
    appendFileSync(gitignorePath, `${prefix}${patterns.join("\n")}\n`, "utf8");
  }
  return { applied: patterns, skipped };
}
