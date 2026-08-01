import assert from "node:assert/strict";
import test from "node:test";
import { commit, createRepository, jsonCheck, runCli, write } from "./helpers.mjs";

const fixtures = new Map([
  ["claude.directory", "Nested/.ClAuDe/config.json"],
  ["claude.instructions", "Nested/ClAuDe.Md"],
  ["claude.local-instructions", "Nested/CLAUDE.local.md"],
  ["agents.directory", "Nested/.AgEnTs/config.json"],
  ["agents.instructions", "Nested/AgEnTs.Md"],
  ["opencode.directory", "Nested/.OpEnCoDe/config.json"],
  ["opencode.config", "Nested/OpenCode.JsOn"],
  ["cursor.directory", "Nested/.CuRsOr/config.json"],
  ["cursor.rules", "Nested/.CuRsOrRuLeS"],
  ["codex.directory", "Nested/.CoDeX/config.json"],
  ["mcp.config", "Nested/.McP.JsOn"],
  ["claude.config", "Nested/ClAuDe.JsOn"],
  ["grill.context", "Nested/CoNtExT.Md"],
  ["grill.adrs", "Nested/DoCs/AdR/0001.md"],
  ["gemini.directory", "Nested/.GeMiNi/settings.json"],
  ["gemini.instructions", "Nested/GeMiNi.Md"],
  ["gemini.ignore", "Nested/.GeMiNiIgNoRe"],
  ["copilot.instructions", "Nested/.GiThUb/CoPiLoT-InStRuCtIoNs.Md"],
  ["copilot.path-instructions", "Nested/.GiThUb/InStRuCtIoNs/rule.md"],
  ["copilot.prompts", "Nested/.GiThUb/PrOmPtS/review.md"],
  ["copilot.agents", "Nested/.GiThUb/AgEnTs/reviewer.md"],
  ["copilot.skills", "Nested/.GiThUb/SkIlLs/review/SKILL.md"],
  ["copilot.hooks", "Nested/.GiThUb/HoOkS/check.json"],
  ["copilot.settings", "Nested/.GiThUb/CoPiLoT/settings.json"],
  ["agent.skill-manifest", "Nested/custom/SkIlL.Md"],
  ["agent.profile", "Nested/custom/reviewer.AgEnT.Md"],
  ["agent.prompt", "Nested/custom/review.PrOmPt.Md"],
  ["agent.instructions", "Nested/custom/review.InStRuCtIoNs.Md"],
  ["windsurf.directory", "Nested/.WiNdSuRf/rules/rule.md"],
  ["windsurf.legacy-rules", "Nested/.WiNdSuRfRuLeS"],
  ["windsurf.ignore", "Nested/.CoDeIuMiGnOrE"],
  ["cline.rules", "Nested/.ClInErUlEs/rule.md"],
  ["cline.ignore", "Nested/.ClInEiGnOrE"],
  ["continue.directory", "Nested/.CoNtInUe/rules/rule.md"],
  ["continue.ignore", "Nested/.CoNtInUeIgNoRe"],
  ["amazonq.directory", "Nested/.AmAzOnQ/rules/rule.md"],
  ["junie.directory", "Nested/.JuNiE/guidelines.md"],
  ["agent.ignore", "Nested/.AiIgNoRe"],
  ["aider.config", "Nested/.AiDeR.CoNf.YmL"],
  ["aider.ignore", "Nested/.AiDeRiGnOrE"],
  ["aider.chat-history", "Nested/.AiDeR.ChAt.HiStOrY.Md"],
  ["aider.input-history", "Nested/.AiDeR.InPuT.HiStOrY"],
  ["aider.llm-history", "Nested/.AiDeR.LlM.HiStOrY.2026"],
  ["mcp.config-plain", "Nested/McP.JsOn"]
]);

test("rules command exposes the complete stable rule set", () => {
  const root = createRepository();
  const result = runCli(root, ["rules", "--format", "json"]);
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(new Set(output.rules.map(({ id }) => id)), new Set(fixtures.keys()));
});

test("every locked rule detects recursive ASCII case variants", () => {
  const root = createRepository();
  for (const path of fixtures.values()) write(root, path);
  commit(root, "all rules", [...fixtures.values()]);

  const { status, report } = jsonCheck(root);
  assert.equal(status, 1);
  const detected = new Set(report.findings.filter(({ type }) => type === "tracked").map(({ ruleId }) => ruleId));
  assert.deepEqual(detected, new Set(fixtures.keys()));
});

test("tool-specific rules win over generic suffix and basename rules", () => {
  const root = createRepository();
  write(root, ".github/prompts/review.prompt.md");
  write(root, ".github/skills/review/SKILL.md");
  write(root, ".claude/skills/review/SKILL.md");
  commit(root, "overlaps", [
    ".github/prompts/review.prompt.md",
    ".github/skills/review/SKILL.md",
    ".claude/skills/review/SKILL.md"
  ]);
  const { report } = jsonCheck(root);
  const byPath = new Map(report.findings.filter(({ type }) => type === "tracked").map((finding) => [finding.path, finding.ruleId]));
  assert.equal(byPath.get(".github/prompts/review.prompt.md"), "copilot.prompts");
  assert.equal(byPath.get(".github/skills/review/SKILL.md"), "copilot.skills");
  assert.equal(byPath.get(".claude/skills/review/SKILL.md"), "claude.directory");
});
