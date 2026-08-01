---
name: ai-file-detector
description: Check whether local AI-agent artifacts are untracked and properly ignored, and safely append missing ignore rules when requested.
---

# AIFileDetector

Run the protected-artifact checker before creating or committing AI-agent configuration, memory, instruction, prompt, skill, or workflow files.

## Check

From anywhere inside the target Git repository, run:

```sh
ai-file-detector check --format json
```

Interpret exit codes as follows:

- `0`: compliant;
- `1`: policy violations;
- `2`: invalid configuration or an unreliable scan.

Use the JSON `ruleId`, `path`, `type`, and `remediation` fields when explaining findings. Never treat exit code `2` as compliance.

## Repair

Only when the user requests remediation, run:

```sh
ai-file-detector check --fix --format json
```

The command may create or append to the root `.gitignore`. It never untracks files or rewrites existing rules. If tracked content, negations, or ambiguous paths remain, explain the required manual action and do not run destructive Git commands without explicit authorization.

## Intentional sharing

When the user intentionally wants to track a protected artifact, add a reviewed exemption to `.ai-artifact-policy.json`. Prefer an exact path exemption over a global rule exemption. In pull requests, an exemption must be merged before a later pull request can rely on it.

List stable rule IDs with:

```sh
ai-file-detector rules
```
