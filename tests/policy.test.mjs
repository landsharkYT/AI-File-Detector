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
  assert.deepEqual(report.exemptions, [
    { scope: "rule", ruleId: "claude.instructions", reason: null, authority: null, provenance: "legacy-unattributed" },
    { scope: "path", path: "nested/agents.md", reason: null, authority: null, provenance: "legacy-unattributed" }
  ]);
});

test("schema 2 reports approved rule and exact-path exemptions", () => {
  const root = createRepository();
  write(root, "docs/adr/0001-publish-decisions.md");
  write(root, "skills/ai-file-detector/SKILL.md");
  policy(root, {
    version: 2,
    exempt: {
      rules: [{
        ruleId: "grill.adrs",
        reason: "Decision records are intentionally published project documentation.",
        authority: "repository-owner:landsharkYT"
      }],
      paths: [{
        path: "skills/ai-file-detector/SKILL.md",
        reason: "This is the published agent integration for the tool.",
        authority: "repository-owner:landsharkYT"
      }]
    }
  });
  commit(root, "approved public artifacts", ["docs/adr/0001-publish-decisions.md", "skills/ai-file-detector/SKILL.md"]);

  const { status, report } = jsonCheck(root);
  assert.equal(status, 0);
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.policy.version, 2);
  assert.deepEqual(report.exemptions, [
    {
      scope: "rule",
      ruleId: "grill.adrs",
      reason: "Decision records are intentionally published project documentation.",
      authority: "repository-owner:landsharkYT",
      provenance: "policy-approved"
    },
    {
      scope: "path",
      path: "skills/ai-file-detector/SKILL.md",
      reason: "This is the published agent integration for the tool.",
      authority: "repository-owner:landsharkYT",
      provenance: "policy-approved"
    }
  ]);
  assert.deepEqual(report.findings, []);
});

const invalidPolicies = [
  ["malformed JSON", "{"],
  ["missing version", JSON.stringify({ exempt: {} })],
  ["unsupported version", JSON.stringify({ version: 3 })],
  ["unknown root property", JSON.stringify({ version: 1, extra: true })],
  ["unknown exemption property", JSON.stringify({ version: 1, exempt: { extra: [] } })],
  ["unknown rule", JSON.stringify({ version: 1, exempt: { rules: ["unknown"] } })],
  ["duplicate rule", JSON.stringify({ version: 1, exempt: { rules: ["grill.adrs", "grill.adrs"] } })],
  ["duplicate case-folded path", JSON.stringify({ version: 1, exempt: { paths: ["A/AGENTS.md", "a/agents.md"] } })],
  ["absolute path", JSON.stringify({ version: 1, exempt: { paths: ["/AGENTS.md"] } })],
  ["traversal", JSON.stringify({ version: 1, exempt: { paths: ["../AGENTS.md"] } })],
  ["backslash", JSON.stringify({ version: 1, exempt: { paths: ["nested\\AGENTS.md"] } })],
  ["schema 2 missing authority", JSON.stringify({ version: 2, exempt: { rules: [{ ruleId: "grill.adrs", reason: "Published." }] } })],
  ["schema 2 wildcard path", JSON.stringify({ version: 2, exempt: { paths: [{ path: "skills/**", reason: "Too broad.", authority: "repository-owner:test" }] } })]
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
