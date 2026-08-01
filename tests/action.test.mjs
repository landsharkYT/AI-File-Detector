import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { commit, createRepository, git, runCli, temporaryDirectory, write, projectRoot } from "./helpers.mjs";

function actionEnvironment(root, base, head) {
  const output = join(root, "github-output.txt");
  const summary = join(root, "github-summary.md");
  const event = join(root, "event.json");
  const runnerTemp = temporaryDirectory("aifd-runner-");
  write(root, "event.json", JSON.stringify({ pull_request: { base: { sha: base }, head: { sha: head } } }));
  write(root, "github-output.txt", "");
  write(root, "github-summary.md", "");
  return {
    environment: {
      AIFD_ACTION: "1",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: event,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      GITHUB_RUN_ID: "42",
      GITHUB_JOB: "check",
      RUNNER_TEMP: runnerTemp
    },
    output,
    summary
  };
}

test("a pull request cannot use an exemption introduced in the same change", () => {
  const root = createRepository();
  write(root, "README.md");
  const base = commit(root, "base");
  write(root, ".ai-artifact-policy.json", JSON.stringify({ version: 1, exempt: { paths: ["AGENTS.md"] } }));
  write(root, "AGENTS.md");
  const head = commit(root, "attempted bypass", ["AGENTS.md"]);
  const action = actionEnvironment(root, base, head);

  const result = runCli(root, ["check"], action.environment);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /::error file=AGENTS\.md::/u);
  const outputs = readFileSync(action.output, "utf8");
  assert.match(outputs, /^result=violations$/mu);
  assert.match(outputs, /^violation-count=1$/mu);
  const reportPath = outputs.match(/^report-path=(.+)$/mu)?.[1];
  assert.ok(reportPath);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  assert.equal(report.policy.source, "base-branch");
  assert.equal(report.findings[0].pullRequestRelation, "added");
  assert.match(readFileSync(action.summary, "utf8"), /AGENTS\.md/u);
});

test("a previously merged base-policy exemption governs the next pull request", () => {
  const root = createRepository();
  write(root, ".ai-artifact-policy.json", JSON.stringify({ version: 1, exempt: { paths: ["AGENTS.md"] } }));
  const base = commit(root, "approved policy");
  write(root, "AGENTS.md");
  const head = commit(root, "intentional shared instructions", ["AGENTS.md"]);
  const action = actionEnvironment(root, base, head);
  const result = runCli(root, ["check"], action.environment);
  assert.equal(result.status, 0);
  assert.match(readFileSync(action.output, "utf8"), /^result=compliant$/mu);
});

test("missing base history fails safely with instructions", () => {
  const root = createRepository();
  write(root, "README.md");
  const head = commit(root);
  const missing = "0".repeat(40);
  const action = actionEnvironment(root, missing, head);
  const result = runCli(root, ["check"], action.environment);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /fetch-depth: 0/u);
});

test("the composite Action is read-only and token-free", () => {
  const action = readFileSync(join(projectRoot, "action.yml"), "utf8");
  assert.doesNotMatch(action, /pull_request_target|GITHUB_TOKEN|--fix/u);
  assert.match(action, /working-directory/u);
  assert.match(action, /violation-count/u);
});
