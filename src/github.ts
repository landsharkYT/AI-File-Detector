import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Report } from "./types.js";
import { jsonReport } from "./report.js";

function commandData(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function commandProperty(value: string): string {
  return commandData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

function output(name: string, value: string): void {
  const path = process.env.GITHUB_OUTPUT;
  if (path === undefined) return;
  appendFileSync(path, `${name}=${value}\n`, "utf8");
}

export function emitGitHub(report: Report): void {
  const temporary = process.env.RUNNER_TEMP ?? process.cwd();
  mkdirSync(temporary, { recursive: true });
  const identity = `${process.env.GITHUB_RUN_ID ?? "local"}-${process.env.GITHUB_JOB ?? "job"}`
    .replaceAll(/[^a-zA-Z0-9_.-]/gu, "-");
  const reportPath = join(temporary, `ai-file-detector-${identity}.json`);
  writeFileSync(reportPath, jsonReport(report), "utf8");

  for (const finding of report.findings) {
    const message = `${finding.type}: ${finding.path} is protected by ${finding.ruleId}; remediation=${finding.remediation}`;
    process.stdout.write(`::error file=${commandProperty(finding.path)}::${commandData(message)}\n`);
  }
  for (const error of report.errors) {
    process.stdout.write(`::error::${commandData(`${error.code}: ${error.message}`)}\n`);
  }

  output("result", report.result);
  output("violation-count", String(report.summary.total));
  output("report-path", reportPath);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined) {
    const rows = report.findings.map((finding) =>
      `| \`${finding.type}\` | \`${finding.path.replaceAll("|", "\\|")}\` | \`${finding.ruleId}\` | \`${finding.pullRequestRelation}\` |`
    );
    const summary = [
      "## AIFileDetector",
      "",
      `Result: **${report.result}** — ${report.summary.total} violation(s).`,
      "",
      ...(rows.length === 0
        ? ["No protected artifacts are exposed."]
        : ["| Type | Path | Rule | Pull request |", "|---|---|---|---|", ...rows]),
      ""
    ].join("\n");
    appendFileSync(summaryPath, summary, "utf8");
  }
}
