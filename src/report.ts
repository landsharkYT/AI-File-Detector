import type { FixResult, Report } from "./types.js";
import { displayPath } from "./paths.js";

export function jsonReport(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function textReport(report: Report, fixes?: FixResult): string {
  const lines: string[] = [];
  if (fixes !== undefined) {
    for (const pattern of fixes.applied) lines.push(`FIXED  appended ${displayPath(pattern)}`);
    for (const skipped of fixes.skipped) lines.push(`SKIP   ${displayPath(skipped.path)}: ${skipped.reason}`);
  }
  for (const finding of report.findings) {
    lines.push(`${finding.type.toUpperCase().padEnd(21)} ${displayPath(finding.path)} [${finding.ruleId}]`);
  }
  for (const error of report.errors) lines.push(`ERROR  ${error.code}: ${error.message}`);
  if (report.result === "compliant") lines.push("Compliant: no protected artifacts are exposed.");
  else if (report.result === "violations") lines.push(`${report.summary.total} policy violation(s) found.`);
  return `${lines.join("\n")}\n`;
}

export function errorReport(code: string, message: string, source: Report["policy"]["source"] = "defaults"): Report {
  return {
    schemaVersion: 1,
    result: "error",
    exitCode: 2,
    policy: { source, path: ".ai-artifact-policy.json", version: 1 },
    summary: { total: 0, tracked: 0, unignored: 0, unprotectedDirectories: 0 },
    findings: [],
    errors: [{ code, message }]
  };
}
