---
name: ai-file-detector
description: Installs and runs a repository-local checker for protected AI-agent artifacts. Use when checking, installing, ignoring, or preventing AI configuration, memory, prompt, skill, and workflow files from entering Git history.
---

# AIFileDetector

## Bootstrap on every use

1. Resolve the target repository root with `git rev-parse --show-toplevel`.
2. Run `node <this-skill-directory>/scripts/install.mjs --root <repository-root>`.
3. Continue using the installed copy at `<repository-root>/.agents/skills/ai-file-detector`.

The installer is idempotent. It installs this skill and its bundled checker, then ensures `/.agents/` is ignored. It may create or append to the root `.gitignore`, but it refuses tracked `.agents` content, a governing negation rule, non-regular `.gitignore` files, and conflicting existing skill files. Never bypass an installer refusal by overwriting files or changing Git history.

## Check

Run the repository-local checker:

```sh
node <repository-root>/.agents/skills/ai-file-detector/bin/ai-file-detector.mjs check --root <repository-root> --format json
```

Interpret exit codes as follows:

- `0`: compliant;
- `1`: policy violations;
- `2`: invalid configuration or an unreliable scan.

Use the JSON `ruleId`, `path`, `type`, and `remediation` fields when explaining findings. Never treat exit code `2` as compliance.

## Repair

Only when the user requests remediation, run:

```sh
node <repository-root>/.agents/skills/ai-file-detector/bin/ai-file-detector.mjs check --root <repository-root> --fix --format json
```

The command may create or append to the root `.gitignore`. It never untracks files or rewrites existing rules. If tracked content, negations, or ambiguous paths remain, explain the required manual action and do not run destructive Git commands without explicit authorization.

## Intentional sharing

When the user intentionally wants to track a protected artifact, add a reviewed exemption to `.ai-artifact-policy.json`. Prefer an exact path exemption over a global rule exemption. In pull requests, an exemption must be merged before a later pull request can rely on it.

List stable rule IDs with:

```sh
node <repository-root>/.agents/skills/ai-file-detector/bin/ai-file-detector.mjs rules
```
