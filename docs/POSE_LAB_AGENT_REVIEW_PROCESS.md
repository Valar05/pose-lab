# Pose Lab Agent Review Process

This is the mandatory review order for Pose Lab visual, Meshy saber, FK, cloud evidence, and red-build work. It exists to prevent false-green reports from overriding human-visible truth.

## 1. Orient Before Acting

Read these first:

- `PROJECT_ORIENTATION.md`
- `AGENTS.md`
- `docs/POSE_LAB_AGENT_FAILURE_CONTRACT.md`
- `docs/POSE_LAB_HUMAN_MEASURABLE_TEST_DOCTRINE.md`
- this file

If the task touches Meshy saber, FK, weapon placement, cloud visual truth, generated evidence, or red builds, do not skip this order.

## 2. Check Authority

Run:

```sh
node tools/pose_lab_current_truth.mjs --json
node tools/pose_lab_visual_truth_preflight.mjs --json
```

If the result is `AUTHORITY_REVOKED_FALSE_GREEN`, stop all of these:

- browser wake
- green/pass/success language
- promotion
- FK edits
- offset edits
- pose or clip edits

The only allowed work is to document, repair, or quarantine the lying evidence gate.

## 3. State Visual Truth

For every visual red build, write the read before diagnosing:

- expected visible relationship
- actual visible relationship
- visible mismatch
- whether telemetry agrees or contradicts the visible read

For Meshy saber, the primary visible question is:

> Does the viewer believe the weapon is held by the character?

Transform metrics may explain a failure. They cannot overrule the visual read.

## 4. Classify Dirty Work

Before another implementation edit in a dirty tree, classify each touched surface:

- accepted production edit
- diagnostic-only edit
- failed-attempt edit
- blocker evidence
- generated scratch

Generated Firebase artifacts are not app code. Do not commit generated evidence unless the workflow explicitly promotes that artifact as durable evidence.

## 5. Choose The Evidence Lane

For Meshy saber acceptance, use Firebase hosted visual truth. Offline render, localhost capture, debug bridge, source-string tests, and standalone screencap are diagnostic-only.

Accepted Meshy saber visual evidence requires:

- current commit/head and cache token
- hosted Firebase screenshot artifacts
- T-pose visible relationship accepted
- Ready visible relationship accepted
- Sense Synthesis human-green
- no open human red-build veto
- clean preflight

If any human screenshot or phone-visible cloud review contradicts the artifact, the artifact is false-green.

## 6. Green Claim Gate

Before saying fixed, green, passed, accepted, or ready:

1. `node tools/pose_lab_visual_truth_preflight.mjs --json` is green.
2. The exact artifact paths or URLs are named.
3. The visual relationship is described in human terms.
4. No open entry in `evidence/human_visual_truth_red_builds.json` matches the commit, artifact commit, workflow run, or review URL.
5. The relevant contract tests pass.

If the user reports red after a green claim, agent authority is revoked immediately. Add or update the red-build ledger before any further implementation.

## 7. Test Harness Gate

Before adding or changing tests for visual, FK, weapon, pose, or cloud evidence work, follow `docs/POSE_LAB_HUMAN_MEASURABLE_TEST_DOCTRINE.md`.

Every changed visual test must be classified as acceptance, diagnostic, guardrail, or quarantine. Acceptance tests must require human-visible cloud evidence and clean preflight. Diagnostic tests may explain transform or metric state, but they must not be used to claim fixed, green, accepted, or ready.

The legacy classification manifest is `contracts/visual_test_roles.json`. Update it when adding or changing visual/FK/weapon/pose tests, and run:

```sh
node tools/test_pose_lab_visual_test_role_audit.mjs
```

## 8. Strike Closure

An open human red-build entry can be unblocked only by all of:

- `status: "superseded"`
- `humanAccepted: true`
- `supersededByCommit`
- `acceptedEvidencePath`

Do not delete a red-build entry to make the gate green. Supersede it with accepted human-visible evidence.

## 9. Required Report

Final reports for visual work must include:

- files changed
- current preflight status
- visual evidence path or URL
- visual relationship read
- tests run
- remaining blockers

If the status is `AUTHORITY_REVOKED_FALSE_GREEN`, do not include success language.
