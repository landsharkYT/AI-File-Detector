import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RULE_IDS } from "./rules.js";
import { asciiLower } from "./paths.js";
import type { EffectiveExemption, Policy, PolicySource } from "./types.js";

export class PolicyError extends Error {
  readonly code = "INVALID_POLICY";

  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

const POLICY_PATH = ".ai-artifact-policy.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], context: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new PolicyError(`${context} contains unknown property ${JSON.stringify(key)}`);
  }
}

function stringArray(value: unknown, context: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new PolicyError(`${context} must be an array of strings`);
  }
  return value;
}

function nonEmptyString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new PolicyError(`${context} must be a non-empty string`);
  return value;
}

function validatePath(value: string): string {
  if (
    value === "" ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("*") ||
    value.includes("?") ||
    value.endsWith("/") ||
    value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new PolicyError(`Invalid repository-relative exemption path ${JSON.stringify(value)}`);
  }
  return value;
}

function unique(values: readonly string[], context: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = asciiLower(value);
    if (seen.has(key)) throw new PolicyError(`${context} contains duplicate ${JSON.stringify(value)}`);
    seen.add(key);
  }
}

export function parsePolicy(content: string | null, source: PolicySource): Policy {
  if (content === null) return { source, version: 1, exemptRules: new Set(), exemptPaths: new Set(), exemptions: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new PolicyError(`${POLICY_PATH} contains malformed JSON`);
  }
  if (!isRecord(parsed)) throw new PolicyError(`${POLICY_PATH} must contain a JSON object`);
  exactKeys(parsed, ["version", "exempt"], POLICY_PATH);
  if (parsed.version !== 1 && parsed.version !== 2) throw new PolicyError(`${POLICY_PATH} must declare "version": 1 or 2`);

  const exempt = parsed.exempt;
  if (exempt !== undefined && !isRecord(exempt)) throw new PolicyError("exempt must be an object");
  const exemptionObject = exempt ?? {};
  exactKeys(exemptionObject, ["rules", "paths"], "exempt");
  const version = parsed.version;
  const exemptions: EffectiveExemption[] = [];
  let rules: string[];
  let paths: string[];
  if (version === 1) {
    rules = stringArray(exemptionObject.rules, "exempt.rules");
    paths = stringArray(exemptionObject.paths, "exempt.paths");
    exemptions.push(
      ...rules.map((ruleId): EffectiveExemption => ({ scope: "rule", ruleId, reason: null, authority: null, provenance: "legacy-unattributed" })),
      ...paths.map((path): EffectiveExemption => ({ scope: "path", path: validatePath(path), reason: null, authority: null, provenance: "legacy-unattributed" }))
    );
  } else {
    const rawRules = exemptionObject.rules ?? [];
    const rawPaths = exemptionObject.paths ?? [];
    if (!Array.isArray(rawRules) || !Array.isArray(rawPaths)) throw new PolicyError("schema 2 exempt.rules and exempt.paths must be arrays");
    rules = rawRules.map((entry, index) => {
      if (!isRecord(entry)) throw new PolicyError(`exempt.rules[${index}] must be an object`);
      exactKeys(entry, ["ruleId", "reason", "authority"], `exempt.rules[${index}]`);
      const ruleId = nonEmptyString(entry.ruleId, `exempt.rules[${index}].ruleId`);
      exemptions.push({
        scope: "rule",
        ruleId,
        reason: nonEmptyString(entry.reason, `exempt.rules[${index}].reason`),
        authority: nonEmptyString(entry.authority, `exempt.rules[${index}].authority`),
        provenance: "policy-approved"
      });
      return ruleId;
    });
    paths = rawPaths.map((entry, index) => {
      if (!isRecord(entry)) throw new PolicyError(`exempt.paths[${index}] must be an object`);
      exactKeys(entry, ["path", "reason", "authority"], `exempt.paths[${index}]`);
      const path = validatePath(nonEmptyString(entry.path, `exempt.paths[${index}].path`));
      exemptions.push({
        scope: "path",
        path,
        reason: nonEmptyString(entry.reason, `exempt.paths[${index}].reason`),
        authority: nonEmptyString(entry.authority, `exempt.paths[${index}].authority`),
        provenance: "policy-approved"
      });
      return path;
    });
  }
  unique(rules, "exempt.rules");
  unique(paths, "exempt.paths");

  for (const id of rules) {
    if (!RULE_IDS.has(id)) throw new PolicyError(`Unknown rule ID ${JSON.stringify(id)}`);
  }
  return {
    source,
    version,
    exemptRules: new Set(rules),
    exemptPaths: new Set(paths.map((path) => asciiLower(validatePath(path)))),
    exemptions
  };
}

export function readWorkingPolicy(root: string): Policy {
  try {
    return parsePolicy(readFileSync(join(root, POLICY_PATH), "utf8"), "working-tree");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return parsePolicy(null, "defaults");
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export function isExempt(policy: Policy, ruleId: string, path: string, artifactRoot: string): boolean {
  if (policy.exemptRules.has(ruleId)) return true;
  return policy.exemptPaths.has(asciiLower(path)) || policy.exemptPaths.has(asciiLower(artifactRoot));
}
