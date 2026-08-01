import assert from "node:assert/strict";
import test from "node:test";
import { commit, createRepository, jsonCheck, write } from "./helpers.mjs";

function policy(root, value) {
  write(root, ".ai-artifact-policy.json", `${JSON.stringify(value, null, 2)}\n`);
}

test("global and case-insensitive exact path exemptions work", () => {
  const root = createRepository();
  write(root, "Nested/AGENTS.md");
  write(root, "one/CLAUDE.md");
  write(root, "two/CLAUDE.md");
  policy(root, {
    version: 1,
    exempt: {
      rules: ["claude.instructions"],
      paths: ["nested/agents.md"]
    }
  });
  commit(root, "exemptions", ["Nested/AGENTS.md", "one/CLAUDE.md", "two/CLAUDE.md"]);
  const { status, report } = jsonCheck(root);
  assert.equal(status, 0);
  assert.equal(report.findings.length, 0);
});

const invalidPolicies = [
  ["malformed JSON", "{"],
  ["missing version", JSON.stringify({ exempt: {} })],
  ["unsupported version", JSON.stringify({ version: 2 })],
  ["unknown root property", JSON.stringify({ version: 1, extra: true })],
  ["unknown exemption property", JSON.stringify({ version: 1, exempt: { extra: [] } })],
  ["unknown rule", JSON.stringify({ version: 1, exempt: { rules: ["unknown"] } })],
  ["duplicate rule", JSON.stringify({ version: 1, exempt: { rules: ["grill.adrs", "grill.adrs"] } })],
  ["duplicate case-folded path", JSON.stringify({ version: 1, exempt: { paths: ["A/AGENTS.md", "a/agents.md"] } })],
  ["absolute path", JSON.stringify({ version: 1, exempt: { paths: ["/AGENTS.md"] } })],
  ["traversal", JSON.stringify({ version: 1, exempt: { paths: ["../AGENTS.md"] } })],
  ["backslash", JSON.stringify({ version: 1, exempt: { paths: ["nested\\AGENTS.md"] } })]
];

for (const [name, content] of invalidPolicies) {
  test(`invalid policy fails closed: ${name}`, () => {
    const root = createRepository();
    write(root, ".ai-artifact-policy.json", content);
    const { status, report } = jsonCheck(root);
    assert.equal(status, 2);
    assert.equal(report.result, "error");
    assert.equal(report.errors[0].code, "INVALID_POLICY");
  });
}
