# AIFileDetector

AIFileDetector is a small, zero-runtime-dependency checker that keeps local AI-agent configuration, instructions, memory, prompts, skills, and workflow artifacts out of Git history.

It ships as one compiled JavaScript CLI, a composite GitHub Action, and an agent skill. The default policy is intentionally aggressive; repositories can explicitly exempt artifacts intended for collaboration.

## Local usage

Node.js 20 or newer and Git are required.

```sh
npm install
npm run build
node dist/ai-file-detector.js check
```

Machine-readable output and safe append-only repair are available through:

```sh
node dist/ai-file-detector.js check --format json
node dist/ai-file-detector.js check --fix
node dist/ai-file-detector.js rules
```

Exit code `0` means compliant, `1` means policy violations, and `2` means invalid configuration or an unreliable scan.

## GitHub Action

Pull-request checks use the target branch's policy. A full checkout is required so the Action can read that base commit without network or write access.

```yaml
name: AI artifact policy

on:
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: landsharkYT/AI-File-Detector@v1
        id: ai-files
```

The Action scans the full tracked tree, emits error annotations and a step summary, and exposes `result`, `violation-count`, and `report-path`. It never edits the checkout or needs a token beyond read-only checkout access. For supply-chain-sensitive repositories, pin both Actions to full commit SHAs.

## Intentional exemptions

Create `.ai-artifact-policy.json` in the repository root:

```json
{
  "version": 1,
  "exempt": {
    "rules": ["grill.adrs"],
    "paths": ["AGENTS.md"]
  }
}
```

Rule exemptions apply throughout the repository. Path exemptions apply only to one exact repository-relative path. Run `ai-file-detector rules` to list the complete stable rule set.

In pull requests, policy changes do not govern the same pull request. Merge a policy exemption first, then rely on it in a later change.

## Development

```sh
npm run typecheck
npm test
npm run check:size
```

The complete behavior and acceptance gate are defined in [`requirements.md`](requirements.md).
