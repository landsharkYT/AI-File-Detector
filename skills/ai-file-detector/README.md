# AIFileDetector Agent Guide

This directory is the repository-local AIFileDetector skill installation. Read `SKILL.md` before acting; it is the canonical workflow and safety policy.

## Check this repository

From the repository root, run:

```sh
node .agents/skills/ai-file-detector/bin/ai-file-detector.mjs check --root . --format json
```

Interpret the exit code and JSON together:

- `0`: compliant;
- `1`: protected-artifact violations were found;
- `2`: configuration is invalid or the scan could not complete reliably.

Report each finding using its `type`, `ruleId`, `path`, and `remediation`. Never treat exit code `2` as compliance.

## List protected artifacts

```sh
node .agents/skills/ai-file-detector/bin/ai-file-detector.mjs rules
```

## Repair only with permission

Run `--fix` only when the user explicitly requests remediation:

```sh
node .agents/skills/ai-file-detector/bin/ai-file-detector.mjs check --root . --fix --format json
```

The checker may safely create or append ignore entries. It never untracks files or rewrites existing `.gitignore` content. Explain any refused or manual remediation; do not use destructive Git commands without explicit authorization.

## Reinstall

The installer is idempotent and verifies this installation without overwriting differing files:

```sh
node .agents/skills/ai-file-detector/scripts/install.mjs --root .
```
