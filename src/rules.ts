import type { Rule, RuleMatch } from "./types.js";
import { asciiLower, normalizeRepositoryPath } from "./paths.js";

const rule = (id: string, pattern: string, kind: Rule["kind"], specificity: number): Rule => ({
  id,
  pattern,
  kind,
  specificity
});

export const RULES: readonly Rule[] = Object.freeze([
  rule("claude.directory", ".claude", "directory", 300),
  rule("claude.instructions", "CLAUDE.md", "basename", 200),
  rule("claude.local-instructions", "CLAUDE.local.md", "basename", 200),
  rule("agents.directory", ".agents", "directory", 300),
  rule("agents.instructions", "AGENTS.md", "basename", 200),
  rule("opencode.directory", ".opencode", "directory", 300),
  rule("opencode.config", "opencode.json", "basename", 200),
  rule("cursor.directory", ".cursor", "directory", 300),
  rule("cursor.rules", ".cursorrules", "basename", 200),
  rule("codex.directory", ".codex", "directory", 300),
  rule("mcp.config", ".mcp.json", "basename", 200),
  rule("claude.config", "claude.json", "basename", 200),
  rule("grill.context", "CONTEXT.md", "basename", 200),
  rule("grill.adrs", "docs/adr", "directory", 310),
  rule("gemini.directory", ".gemini", "directory", 300),
  rule("gemini.instructions", "GEMINI.md", "basename", 200),
  rule("gemini.ignore", ".geminiignore", "basename", 200),
  rule("copilot.instructions", ".github/copilot-instructions.md", "full-path", 400),
  rule("copilot.path-instructions", ".github/instructions", "directory", 320),
  rule("copilot.prompts", ".github/prompts", "directory", 320),
  rule("copilot.agents", ".github/agents", "directory", 320),
  rule("copilot.skills", ".github/skills", "directory", 320),
  rule("copilot.hooks", ".github/hooks", "directory", 320),
  rule("copilot.settings", ".github/copilot", "directory", 320),
  rule("agent.skill-manifest", "SKILL.md", "basename", 200),
  rule("agent.profile", ".agent.md", "suffix", 100),
  rule("agent.prompt", ".prompt.md", "suffix", 100),
  rule("agent.instructions", ".instructions.md", "suffix", 100),
  rule("windsurf.directory", ".windsurf", "directory", 300),
  rule("windsurf.legacy-rules", ".windsurfrules", "basename", 200),
  rule("windsurf.ignore", ".codeiumignore", "basename", 200),
  rule("cline.rules", ".clinerules", "directory", 300),
  rule("cline.ignore", ".clineignore", "basename", 200),
  rule("continue.directory", ".continue", "directory", 300),
  rule("continue.ignore", ".continueignore", "basename", 200),
  rule("amazonq.directory", ".amazonq", "directory", 300),
  rule("junie.directory", ".junie", "directory", 300),
  rule("agent.ignore", ".aiignore", "basename", 200),
  rule("aider.config", ".aider.conf.yml", "basename", 200),
  rule("aider.ignore", ".aiderignore", "basename", 200),
  rule("aider.chat-history", ".aider.chat.history.md", "basename", 200),
  rule("aider.input-history", ".aider.input.history", "basename", 200),
  rule("aider.llm-history", ".aider.llm.history*", "prefix", 110),
  rule("mcp.config-plain", "mcp.json", "basename", 200)
]);

export const RULE_IDS = new Set(RULES.map(({ id }) => id));

function sequenceIndex(segments: readonly string[], pattern: readonly string[]): number {
  outer: for (let index = 0; index <= segments.length - pattern.length; index += 1) {
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (segments[index + offset] !== pattern[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

function match(ruleDefinition: Rule, normalizedPath: string): RuleMatch | null {
  const lowered = asciiLower(normalizedPath);
  const segments = lowered.split("/");
  const originalSegments = normalizedPath.split("/");
  const pattern = asciiLower(ruleDefinition.pattern);
  const patternSegments = pattern.split("/");
  const basename = segments.at(-1) ?? "";

  if (ruleDefinition.kind === "basename") {
    if (basename !== pattern) return null;
    return { rule: ruleDefinition, artifactRoot: normalizedPath };
  }

  if (ruleDefinition.kind === "suffix") {
    if (!basename.endsWith(pattern)) return null;
    return { rule: ruleDefinition, artifactRoot: normalizedPath };
  }

  if (ruleDefinition.kind === "prefix") {
    const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
    if (!basename.startsWith(prefix)) return null;
    return { rule: ruleDefinition, artifactRoot: normalizedPath };
  }

  const index = sequenceIndex(segments, patternSegments);
  if (index < 0) return null;
  const artifactRoot = originalSegments.slice(0, index + patternSegments.length).join("/");

  if (ruleDefinition.kind === "full-path") {
    const endsAtMatch = index + patternSegments.length === segments.length;
    if (!endsAtMatch) return null;
  }
  return { rule: ruleDefinition, artifactRoot };
}

export function resolveRule(value: string): RuleMatch | null {
  const normalized = normalizeRepositoryPath(value);
  const matches = RULES.flatMap((candidate) => {
    const result = match(candidate, normalized);
    return result === null ? [] : [result];
  });
  matches.sort((left, right) =>
    right.rule.specificity - left.rule.specificity ||
    right.rule.pattern.length - left.rule.pattern.length ||
    left.rule.id.localeCompare(right.rule.id)
  );
  return matches[0] ?? null;
}

export function resolveDirectoryRule(value: string): RuleMatch | null {
  const result = resolveRule(value);
  if (result === null) return null;
  return result.rule.kind === "directory" ? result : null;
}
