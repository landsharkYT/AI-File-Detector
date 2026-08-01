import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RULE_IDS } from "./rules.js";
import { asciiLower } from "./paths.js";
import type { Policy, PolicySource } from "./types.js";

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

function validatePath(value: string): string {
  if (
    value === "" ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.endsWith("/") ||
    value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new PolicyError(`Invalid repository-relative exemption path ${JSON.stringify(value)}`);
  }
  return asciiLower(value);
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
  if (content === null) return { source, exemptRules: new Set(), exemptPaths: new Set() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new PolicyError(`${POLICY_PATH} contains malformed JSON`);
  }
  if (!isRecord(parsed)) throw new PolicyError(`${POLICY_PATH} must contain a JSON object`);
  exactKeys(parsed, ["version", "exempt"], POLICY_PATH);
  if (parsed.version !== 1) throw new PolicyError(`${POLICY_PATH} must declare "version": 1`);

  const exempt = parsed.exempt;
  if (exempt !== undefined && !isRecord(exempt)) throw new PolicyError("exempt must be an object");
  const exemptionObject = exempt ?? {};
  exactKeys(exemptionObject, ["rules", "paths"], "exempt");
  const rules = stringArray(exemptionObject.rules, "exempt.rules");
  const paths = stringArray(exemptionObject.paths, "exempt.paths");
  unique(rules, "exempt.rules");
  unique(paths, "exempt.paths");

  for (const id of rules) {
    if (!RULE_IDS.has(id)) throw new PolicyError(`Unknown rule ID ${JSON.stringify(id)}`);
  }
  return {
    source,
    exemptRules: new Set(rules),
    exemptPaths: new Set(paths.map(validatePath))
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
