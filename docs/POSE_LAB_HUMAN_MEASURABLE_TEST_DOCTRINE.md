# Pose Lab Human-Measurable Test Doctrine

This doctrine exists because Pose Lab tests repeatedly encoded broken visual states as repo truth. A test that says the agent is correct before a human-visible result proves it is correct is part of the bug.

## Core Rule

For visual work, tests are not acceptance authority by themselves. Tests may support acceptance only when they measure, preserve, or block against a human-visible relationship.

The controlling question for Meshy saber work is:

> Would a human believe the weapon is held by the character after seeing the screenshot for one second?

If a test cannot connect its assertion to that visible question, it is diagnostic-only.

## Test Categories

Every new or changed visual/FK/weapon test must identify itself as one of:

- `acceptance`: requires current human-visible cloud evidence and clean preflight.
- `diagnostic`: explains a failure but cannot close a red build.
- `guardrail`: prevents known bad proof such as source-string, marker-only, telemetry-only, stale-cache, or generated-artifact promotion.
- `quarantine`: preserves a failed run, false-green artifact, or red-build strike so it cannot be reused as green.

If a test omits the category, treat it as diagnostic-only.

Legacy classifications live in `contracts/visual_test_roles.json` and are enforced by `node tools/test_pose_lab_visual_test_role_audit.mjs`. New visual tests must either match an existing rule intentionally or add a new explicit rule with a reason.

## Forbidden Test Shape

Do not write tests that bless a visual fix only because:

- a schema has `ok: true`;
- a marker, hilt dot, socket, parent chain, or debug line exists;
- source strings contain the desired branch;
- a cache token changed;
- offline render, localhost capture, or debug bridge output is green;
- generated evidence exists under `generated/`;
- a metric assertion is true without a matching visible relationship read.

These checks may be useful, but they are not acceptance.

## Required Acceptance Shape

A visual acceptance test must require all of:

- current commit/head and cache token;
- hosted Firebase visual evidence for the exact reviewed route;
- readable screenshots or contact sheets, not just JSON;
- explicit expected visible relationship and actual visible relationship;
- Sense Simulation / Sense Synthesis verdict tied to what a viewer believes;
- no matching open entry in `evidence/human_visual_truth_red_builds.json`;
- `node tools/pose_lab_visual_truth_preflight.mjs --json` green.

For Meshy saber, the assertion must name the real relationship: hand owns hilt, hilt is not collapsed to wrist, blade axis projects plausibly from grip, and Ready/T-pose do not contradict each other.

## Red-Build Rule

When the user reports a red screenshot after tests pass, the tests are suspect until proven otherwise. Add or update a quarantine/guardrail test that fails for the false-green path before editing FK, offsets, clip routing, or pose math again.

The correct order is:

1. Preserve the human-visible contradiction.
2. Identify which test or harness accepted the contradiction.
3. Make that test/harness red for the same contradiction.
4. Only then change runtime behavior.

## Review Checklist

Before accepting a test for visual work, ask:

- What visible relationship does this test measure?
- Could the screenshot still be red while this test passes?
- Is this acceptance, diagnostic, guardrail, or quarantine?
- Does it require cloud visual evidence when cloud visual evidence is the authority?
- Does its failure message tell the next agent what human-visible proof is missing?

If the answer is unclear, the test is not an acceptance test.
