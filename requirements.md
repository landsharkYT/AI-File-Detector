# AIFileDetector V1 Requirements

## Naming

- Product and repository: `AIFileDetector`
- CLI command: `ai-file-detector`
- GitHub Action: `landsharkYT/AI-File-Detector@v1`
- Agent skill: `ai-file-detector`
- Internal capability: protected-artifact checker

The internal capability name distinguishes this narrow policy check from any broader detection features the product may gain later.

## Status

Requirements interview complete. This document defines the agreed V1 scope and acceptance gate.

## Purpose

AIFileDetector protects repositories from accidentally committing local AI-agent configuration, memory, and workflow artifacts that the repository owner considers private or disposable.

## Core Policy

A protected artifact must never be tracked by Git. When a protected artifact exists in a local working tree, it must also resolve as ignored by Git.

The checker does not require `.gitignore` entries for protected artifacts that do not exist. This avoids adding irrelevant ignore patterns for AI tools a repository does not use.

It must be usable in two environments:

- by a local agent as a skill, before or while it creates affected files;
- by GitHub automation, to detect affected files that have entered a commit or pull request.

## Source Material

The initial concept in `gemini.pdf` proposes a Bash checker for paths such as `.claude`, `CLAUDE.md`, `.agents`, `AGENTS.md`, `.opencode`, `.cursor`, `.codex`, `.mcp.json`, and generated ADR directories. It also proposes packaging the policy both as an agent skill and as a GitHub Action.

The PDF implementation is a starting point, not an accepted specification. In particular, GitHub cannot inspect local files that were ignored and never committed, so local and GitHub enforcement have different observable inputs.

## Scope

### Local skill

The skill helps an agent comply with the repository's artifact policy before creating or committing a matching path.

Its default mode is read-only: it reports protected artifacts, whether Git tracks them, whether Git ignores local instances, and the action needed to comply.

An explicit `--fix` mode may append missing ignore entries when doing so is unambiguous. It must not rewrite or remove existing `.gitignore` content, add negation rules, untrack files, or modify Git history. It must refuse automatic repair when an existing negation rule, tracked artifact, or other ambiguity would make an append-only edit unsafe, and report manual instructions instead.

If no `.gitignore` exists, `--fix` may create a root `.gitignore`. The new file contains rules only for protected artifacts that currently exist; it must not prepopulate unused default protections. A read-only scan reports the missing `.gitignore` without creating it.

### GitHub integration

V1 ships as a standalone composite GitHub Action, consumable as:

```yaml
- uses: landsharkYT/AI-File-Detector@v1
```

The Action runs the same core checker as the local skill and enforces the same artifact policy against repository or pull-request contents. It is designed to be included later within a larger multi-bot composite Action. A hosted GitHub App is outside V1.

The Action scans the entire tracked repository rather than only pull-request changes. When pull-request metadata is available, each finding indicates whether the path was introduced or modified by the pull request or was already present. Any unexempted violation fails the check, including a legacy violation unrelated to the current change.

### Action interface

The composite Action accepts one optional input:

- `working-directory`: defaults to `.`, then resolves the enclosing Git repository root.

It exposes three outputs even when violations fail the check:

- `result`: `compliant`, `violations`, or `error`;
- `violation-count`: the integer number of policy violations;
- `report-path`: the path to the complete JSON report.

The Action always emits GitHub annotations and a step summary. It does not expose `--fix`, accept a token, or request write permissions.

### Pull-request security

The Action uses a read-only security model:

- it requires only `contents: read`;
- it runs on `pull_request`, never `pull_request_target`;
- it does not execute repository scripts or protected artifacts;
- it treats filenames and policy values strictly as data and never evaluates them as shell code;
- it uses NUL-safe Git path handling so unusual filenames cannot alter command structure;
- it pins third-party Action dependencies to full commit SHAs;
- it does not post comments, create commits, or modify repository contents.

### Shared policy

Both integrations should derive their decisions from one policy definition so that a path is not treated differently merely because the check runs locally or on GitHub.

## Technology and Packaging

V1 is implemented in TypeScript and compiled into one zero-dependency JavaScript CLI. The compiled artifact is committed or attached to releases so consumers do not run `npm install` or compile TypeScript.

The local skill and composite GitHub Action invoke the same JavaScript artifact through Node.js. Production code has no npm runtime dependencies. Bash, Python, C, Go, Rust, hosted services, and native per-platform binaries are outside V1.

Repository scanning delegates to the installed Git executable; JavaScript handles policy validation, path classification, output formatting, and safe process orchestration.

## CLI Interface

V1 exposes:

```text
ai-file-detector [check] [--root PATH] [--format text|json] [--fix]
ai-file-detector rules [--format text|json]
ai-file-detector --help
ai-file-detector --version
```

- No subcommand defaults to `check`.
- `--root` defaults to the current Git repository root.
- `--fix` performs only the previously defined safe append-only repairs, rescans, and exits according to the final state.
- `rules` lists every stable rule ID and protected path pattern so exemptions can be configured without guessing identifiers.
- The CLI provides no command-line exemptions and performs no network access.
- Unknown options and paths outside a Git repository produce exit code `2`.

## Output Contract

The core checker provides:

- concise human-readable terminal output by default;
- GitHub workflow error annotations and a step summary when run by the composite Action;
- stable machine-readable output through `--format json` for agents and future integrations.

Exit codes are part of the public interface:

- `0`: the repository complies with the artifact policy;
- `1`: one or more policy violations were found;
- `2`: configuration is invalid or the checker could not complete reliably.

All output modes must represent the same findings and final status.

### Finding types

V1 has three policy-violation types:

- `tracked`: a concrete protected file or symlink is tracked by Git. It remains a violation even when a later ignore rule matches it because ignore rules do not remove tracked content from the index or history.
- `unignored`: a concrete protected file or symlink exists locally, is not tracked, and does not resolve as ignored by Git.
- `unprotected-directory`: a protected directory exists, but a synthetic child path does not resolve as ignored. This detects empty and partially covered directories before future contents can be committed.

Fully ignored, untracked artifacts do not produce violations. Directory rules report the directory-level coverage problem and any concrete tracked descendants so remediation remains actionable.

### JSON schema

`--format json` emits a deterministic document shaped as follows:

```json
{
  "schemaVersion": 1,
  "result": "violations",
  "exitCode": 1,
  "policy": {
    "source": "base-branch",
    "path": ".ai-artifact-policy.json",
    "version": 1
  },
  "summary": {
    "total": 1,
    "tracked": 1,
    "unignored": 0,
    "unprotectedDirectories": 0
  },
  "findings": [
    {
      "type": "tracked",
      "ruleId": "agents.instructions",
      "path": "AGENTS.md",
      "artifactRoot": "AGENTS.md",
      "ignored": false,
      "ignoreRule": null,
      "pullRequestRelation": "added",
      "remediation": "untrack-and-ignore"
    }
  ],
  "errors": []
}
```

Paths use repository-relative `/` separators. Findings are sorted by path and then rule ID. Output contains no timestamps or machine-specific absolute paths. Enumerated fields carry machine meaning; human prose, when present, is supplementary. A breaking change requires a new `schemaVersion`.

Schema V1 uses these enumerations:

- `result`: `compliant`, `violations`, or `error`;
- `policy.source`: `defaults`, `working-tree`, or `base-branch`;
- `pullRequestRelation`: `added`, `modified`, `pre-existing`, `not-applicable`, or `unknown`;
- `remediation`: `untrack-and-ignore`, `add-ignore`, `protect-directory`, or `manual`.

`ignoreRule` is either `null` or an object containing the repository-relative ignore-file path, line number, and matched pattern reported by Git. Configuration and execution errors use stable codes in `errors`; prose messages are supplementary.

## Default Protected Artifacts

V1 protects the following artifacts by default:

| Stable rule ID | Protected path |
|---|---|
| `claude.directory` | `.claude/**` |
| `claude.instructions` | `CLAUDE.md` |
| `claude.local-instructions` | `CLAUDE.local.md` |
| `agents.directory` | `.agents/**` |
| `agents.instructions` | `AGENTS.md` |
| `opencode.directory` | `.opencode/**` |
| `opencode.config` | `opencode.json` |
| `cursor.directory` | `.cursor/**` |
| `cursor.rules` | `.cursorrules` |
| `codex.directory` | `.codex/**` |
| `mcp.config` | `.mcp.json` |
| `claude.config` | `claude.json` |
| `grill.context` | `CONTEXT.md` |
| `grill.adrs` | `docs/adr/**` |
| `gemini.directory` | `.gemini/**` |
| `gemini.instructions` | `GEMINI.md` |
| `gemini.ignore` | `.geminiignore` |
| `copilot.instructions` | `.github/copilot-instructions.md` |
| `copilot.path-instructions` | `.github/instructions/**` |
| `copilot.prompts` | `.github/prompts/**` |
| `copilot.agents` | `.github/agents/**` |
| `copilot.skills` | `.github/skills/**` |
| `copilot.hooks` | `.github/hooks/**` |
| `copilot.settings` | `.github/copilot/**` |
| `agent.skill-manifest` | `SKILL.md` |
| `agent.profile` | `*.agent.md` |
| `agent.prompt` | `*.prompt.md` |
| `agent.instructions` | `*.instructions.md` |
| `windsurf.directory` | `.windsurf/**` |
| `windsurf.legacy-rules` | `.windsurfrules` |
| `windsurf.ignore` | `.codeiumignore` |
| `cline.rules` | `.clinerules/**` |
| `cline.ignore` | `.clineignore` |
| `continue.directory` | `.continue/**` |
| `continue.ignore` | `.continueignore` |
| `amazonq.directory` | `.amazonq/**` |
| `junie.directory` | `.junie/**` |
| `agent.ignore` | `.aiignore` |
| `aider.config` | `.aider.conf.yml` |
| `aider.ignore` | `.aiderignore` |
| `aider.chat-history` | `.aider.chat.history.md` |
| `aider.input-history` | `.aider.input.history` |
| `aider.llm-history` | `.aider.llm.history*` |
| `mcp.config-plain` | `mcp.json` |

These defaults are intentionally aggressive. A repository can explicitly exempt individual defaults when they are meant to be shared.

The expanded defaults cover current repository artifacts documented for Gemini CLI, GitHub Copilot, Windsurf, Cline, Continue, Amazon Q, JetBrains Junie, Aider, and MCP-based tools. Generic names such as `PLAN.md`, `TASKS.md`, `SPEC.md`, `requirements.md`, and `PROMPT.md` are excluded because they do not reliably identify AI tooling.

Every default protection is evaluated recursively throughout the repository, not only at its root. For example, both `AGENTS.md` and `packages/web/AGENTS.md` match the `agents.instructions` rule. Directory rules likewise match protected directories at any depth.

Protected path matching is ASCII case-insensitive on every platform. Capitalization variants such as `CLAUDE.md`, `claude.md`, and `Claude.md` resolve to the same protection rule.

When a path matches more than one default, exactly one canonical rule governs it. Rule specificity, from highest to lowest, is:

1. exact full-path rule;
2. tool-specific directory rule;
3. exact basename rule;
4. generic suffix rule.

The checker emits one finding and requires at most one exemption for a path. For example, `.github/prompts/review.prompt.md` resolves to `copilot.prompts`, not the less-specific `agent.prompt` rule.

Symlinks are evaluated using their repository-relative link paths and are never dereferenced. A symlink whose link path matches a protected rule is treated like any other matching artifact. A differently named symlink is not classified by its target, and the checker must not traverse through a symlink outside the repository.

`CONTEXT.md` is protected because it is an artifact produced by the `/grill-with-docs` domain-modeling workflow. A repository that treats it as shared documentation can exempt it.

ADR protection applies in both single-context repositories (`docs/adr/**`) and context-specific locations in monorepos (`**/docs/adr/**`). A repository can exempt the corresponding rule when its ADRs are intentionally shared.

## Policy Configuration

A repository may exempt individual default protections in a tracked `.ai-artifact-policy.json` file. Exemptions remain separate from `.gitignore` behavior and support two scopes. For example:

```json
{
  "version": 1,
  "exempt": {
    "rules": ["grill.adrs"],
    "paths": ["AGENTS.md"]
  }
}
```

A rule exemption disables one default protection throughout the repository. A path exemption permits one exact repository-relative path while leaving the rule active elsewhere. Path exemptions use the same ASCII case-insensitive comparison as protection rules. V1 does not support exemption globs.

An exemption declares that the matching artifact may be tracked intentionally. It must be explicit and reviewable in repository history.

The policy file is optional. If absent, every default protection applies. If present, it is validated strictly and fails closed with exit code `2` when it contains malformed JSON, an unsupported or missing `version`, unknown properties, unknown rule IDs, duplicate exemptions, absolute exemption paths, `..` traversal, or non-`/` path separators.

V1 accepts only `"version": 1`. Exact path exemptions are repository-relative and may name paths that do not exist yet, allowing an exemption to be merged before a later pull request relies on it.

For pull-request checks, the target branch's policy file governs the proposed tree. Changes to `.ai-artifact-policy.json` in the pull request do not affect that same check. A new exemption must be reviewed and merged before a later pull request can rely on it. Outside a pull-request context, the checker uses the policy file in the checked-out repository.

## Existing `.gitignore` Safety

AIFileDetector must not overwrite, reorder, remove, negate, or otherwise conflict with existing `.gitignore` rules. It may inspect Git's resolved ignore behavior and report what needs attention. In explicit `--fix` mode, it may make safe append-only additions while preserving existing content and semantics.

## Constraints Discovered

- A GitHub-hosted check sees committed repository contents, not ignored files that remain only on a developer's machine.
- Some candidate paths, including `AGENTS.md`, `CLAUDE.md`, `.agents`, and ADRs, may be intentionally shared in some repositories. Treating every candidate as universally forbidden would create false positives.
- Ignore status and tracked status are distinct: adding an already tracked file to `.gitignore` does not remove it from Git history or the index.
- Existing `.gitignore` files are user-owned policy and must not be overridden by AIFileDetector.

## V1 Acceptance Criteria

V1 is complete only when automated tests demonstrate all of the following:

| Area | Acceptance gate |
|---|---|
| Rule coverage | Every locked rule detects recursive and case-variant matches. |
| Precedence | Overlapping paths resolve to exactly one most-specific rule. |
| Exemptions | Global and exact-path exemptions work, while an exemption introduced by a pull request does not govern that same pull request. |
| Git states | `tracked`, `unignored`, and `unprotected-directory` findings are correctly distinguished. |
| Fix safety | `--fix` creates or appends safely and refuses tracked, negated, or ambiguous cases. |
| Configuration | Every specified invalid-policy case exits `2`; an absent policy activates all defaults. |
| Path safety | Spaces, newlines, Unicode, leading dashes, and symlinks cannot alter command execution or escape the repository. |
| Output | Text, annotations, summaries, Action outputs, and JSON agree; JSON output is deterministic. |
| Action | The composite Action scans the full tree, marks pull-request relation, remains read-only, and runs without consumer installation. |
| Packaging | Distribution contains one zero-dependency compiled JavaScript artifact and no production npm packages. |
| Size | The compiled JavaScript is at most 100 KiB, excluding source maps. |
| Performance | A clean 10,000-file Linux fixture scans in under two seconds with peak RSS below 100 MiB. |
| Compatibility | V1 works on current GitHub-hosted Ubuntu runners and the locally supported Node.js versions documented by the project. |

## Non-goals

- Detecting AI-generated prose, source code, or UI design patterns.
- Automatically removing tracked files from the Git index or history.
- Rewriting, reordering, deleting, or negating existing `.gitignore` rules.
- Modifying repositories from GitHub Actions.
- A hosted GitHub App, webhook server, or persistent service.
- Network access or GitHub API integration in the core checker.
- Runtime npm dependencies or native per-platform binaries.
- Windows- or macOS-specific guarantees beyond behavior naturally provided by Node.js and Git.
- Generic planning or documentation filenames that do not reliably identify AI tooling.
