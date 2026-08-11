export type RuleKind = "full-path" | "directory" | "basename" | "suffix" | "prefix";

export interface Rule {
  readonly id: string;
  readonly pattern: string;
  readonly kind: RuleKind;
  readonly specificity: number;
}

export interface RuleMatch {
  readonly rule: Rule;
  readonly artifactRoot: string;
}

export interface IgnoreRule {
  readonly source: string;
  readonly line: number;
  readonly pattern: string;
}

export type FindingType = "tracked" | "unignored" | "unprotected-directory";
export type PullRequestRelation = "added" | "modified" | "pre-existing" | "not-applicable" | "unknown";
export type Remediation = "untrack-and-ignore" | "add-ignore" | "protect-directory" | "manual";
export type Result = "compliant" | "violations" | "error";
export type PolicySource = "defaults" | "working-tree" | "base-branch";
export type ExemptionProvenance = "legacy-unattributed" | "policy-approved";

export type EffectiveExemption =
  | {
      readonly scope: "rule";
      readonly ruleId: string;
      readonly reason: string | null;
      readonly authority: string | null;
      readonly provenance: ExemptionProvenance;
    }
  | {
      readonly scope: "path";
      readonly path: string;
      readonly reason: string | null;
      readonly authority: string | null;
      readonly provenance: ExemptionProvenance;
    };

export interface Finding {
  readonly type: FindingType;
  readonly ruleId: string;
  readonly path: string;
  readonly artifactRoot: string;
  readonly ignored: boolean;
  readonly ignoreRule: IgnoreRule | null;
  readonly pullRequestRelation: PullRequestRelation;
  readonly remediation: Remediation;
}

export interface ReportError {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface PolicyDescriptor {
  readonly source: PolicySource;
  readonly path: ".ai-artifact-policy.json";
  readonly version: 1 | 2;
}

export interface Report {
  readonly schemaVersion: 2;
  readonly result: Result;
  readonly exitCode: 0 | 1 | 2;
  readonly policy: PolicyDescriptor;
  readonly summary: {
    readonly total: number;
    readonly tracked: number;
    readonly unignored: number;
    readonly unprotectedDirectories: number;
  };
  readonly findings: readonly Finding[];
  readonly exemptions: readonly EffectiveExemption[];
  readonly errors: readonly ReportError[];
}

export interface Policy {
  readonly source: PolicySource;
  readonly version: 1 | 2;
  readonly exemptRules: ReadonlySet<string>;
  readonly exemptPaths: ReadonlySet<string>;
  readonly exemptions: readonly EffectiveExemption[];
}

export interface PullRequestContext {
  readonly base: string;
  readonly head: string;
}

export interface FixResult {
  readonly applied: readonly string[];
  readonly skipped: readonly { readonly path: string; readonly reason: string }[];
}
