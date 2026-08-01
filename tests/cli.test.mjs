import assert from "node:assert/strict";
import test from "node:test";
import { runCli, temporaryDirectory } from "./helpers.mjs";

test("help and version are available without a repository", () => {
  const root = temporaryDirectory();
  const help = runCli(root, ["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/u);
  const version = runCli(root, ["--version"]);
  assert.equal(version.status, 0);
  assert.match(version.stdout, /^1\.0\.0\n$/u);
});

test("unknown arguments and non-Git roots exit 2", () => {
  const root = temporaryDirectory();
  assert.equal(runCli(root, ["--unknown"]).status, 2);
  const invalidJson = runCli(root, ["--format", "json", "--unknown"]);
  assert.equal(invalidJson.status, 2);
  assert.equal(JSON.parse(invalidJson.stdout).errors[0].code, "INVALID_ARGUMENTS");
  const result = runCli(root, ["check", "--format", "json"]);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.result, "error");
  assert.equal(report.exitCode, 2);
});

test("rules rejects check-only options", () => {
  const root = temporaryDirectory();
  assert.equal(runCli(root, ["rules", "--fix"]).status, 2);
  assert.equal(runCli(root, ["rules", "--root", root]).status, 2);
});
