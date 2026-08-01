import assert from "node:assert/strict";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { cliPath, commit, createRepository, temporaryDirectory } from "./helpers.mjs";

test("compiled artifact stays under 100 KiB", () => {
  assert.ok(statSync(cliPath).size <= 100 * 1024);
});

test("10,000 tracked files scan within time and memory budgets", { timeout: 30_000 }, async () => {
  const root = createRepository();
  for (let directory = 0; directory < 100; directory += 1) {
    const target = join(root, "fixture", String(directory));
    mkdirSync(target, { recursive: true });
    for (let file = 0; file < 100; file += 1) {
      writeFileSync(join(target, `${file}.txt`), "x", "utf8");
    }
  }
  commit(root, "10k fixture");
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const started = performance.now();
  const child = spawn(process.execPath, [cliPath, "check", "--format", "json"], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let peakKilobytes = 0;
  const sampler = setInterval(() => {
    try {
      const status = readFileSync(`/proc/${child.pid}/status`, "utf8");
      const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/mu);
      if (match?.[1] !== undefined) peakKilobytes = Math.max(peakKilobytes, Number.parseInt(match[1], 10));
    } catch {
      // The process may exit between sampling and reading /proc.
    }
  }, 2);
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const status = await new Promise((resolveStatus, reject) => {
    child.once("error", reject);
    child.once("close", resolveStatus);
  });
  clearInterval(sampler);
  const elapsedMilliseconds = performance.now() - started;
  assert.equal(status, 0, Buffer.concat(stderr).toString("utf8"));
  assert.equal(JSON.parse(Buffer.concat(stdout).toString("utf8")).result, "compliant");
  assert.ok(elapsedMilliseconds < 2_000, `scan took ${elapsedMilliseconds.toFixed(1)}ms`);
  assert.ok(peakKilobytes < 100 * 1024, `peak RSS was ${peakKilobytes} KiB`);
});
