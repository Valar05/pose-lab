# Pose Lab Agent Failure Contract

This document exists because the Meshy saber FK work caused unacceptable user pain. Future Pose Lab agents must treat it as an operating contract, not background reading.

The ordered agent review checklist is `docs/POSE_LAB_AGENT_REVIEW_PROCESS.md`. The test-writing doctrine is `docs/POSE_LAB_HUMAN_MEASURABLE_TEST_DOCTRINE.md`. Both are mandatory for Meshy saber, FK, visual truth, generated evidence, and red-build work.

## Controlling Instruction

For the Meshy saber problem, the controlling instruction is:

> Meshy must be FPS weapon FK plus authored offsets, nothing else.

That means the architecture must match FPS first. Do not tune offsets, markers, or visual landmarks until FPS-vs-Meshy FK parity is proven at the parent/local-matrix level.

## Pain Mined From The Failed Session

- The user repeatedly asked for simple FK identical to FPS except authored offsets, and the agent kept solving narrower symptoms.
- The agent accepted marker, socket, cache-token, and generated-artifact evidence while the user repeatedly reported unchanged screenshots.
- The agent accepted Firebase telemetry and green workflow status before inspecting the cloud screenshots that were supposed to be the visual authority.
- The agent later inspected the screenshots but still accepted object/clip/marker presence as visual proof while missing the visible relationship failures: mutated T-pose wrist/saber relationship and non-accepted Ready hand/sword relationship.
- The agent treated a green Firebase artifact as equivalent to the phone-visible manual review, even though the user's screenshots showed the warmed browser first rendering the wrong active clip for the Ready URL and then labeling `REVIEW ROUTE READY` while the hand/hilt/blade relationship still looked unacceptable.
- The agent edited placement literals before proving that Meshy and FPS shared the same weapon architecture.
- The agent documented and implied fixed states before the user accepted the visual result.
- The agent let tests encode the broken Meshy-specific design, then used those tests as proof.
- The agent treated tests as declarations of correctness instead of instruments that must first prove a human-measurable visual relationship.
- The agent treated "red build" as another implementation prompt instead of a stop signal requiring assumption audit.
- The agent made a dirty repo dirtier without first separating accepted production work from failed-attempt diagnostics.
- The agent repeatedly optimized for momentum over prompt attention.

## Required Behavior After Corrections

- The latest user correction controls. Restate it in one sentence before more implementation.
- If the user says "nothing changed", "red build", "wrong target", or "you ignored me", stop the active premise and audit assumptions before another patch.
- If two consecutive visual edits are no-ops, do not make a third visual edit. Build or fix the evidence path first.
- Do not use success language for visual work until the evidence type matches the failure type and the user has not contradicted it.
- Do not use success language for cloud visual work until the actual cloud screenshots have been inspected and described.
- Do not use success language for cloud visual work until the expected visible relationship and actual visible relationship are compared explicitly.
- Do not use success language after waking the cloud URL until the phone-visible browser state agrees with the artifact: requested clip, highlighted clip row, review banner, body pose, hilt position, and blade axis must all tell the same story.
- Manual Meshy Character selection is a red build. A cloud URL that requires the user to choose Meshy manually has not proven route hydration, even if the route banner or telemetry later turns green.
- After a human red-build report, the required order is: state the visible contradiction, fix the lying evidence/UI gate, prove the gate catches that contradiction, and only then edit FK, pose, or offsets.
- Do not write victory documentation for unaccepted visual changes.
- Do not add or update visual tests that assert the agent is right before current human-visible evidence proves the relationship. Classify them as acceptance, diagnostic, guardrail, or quarantine.
- In a dirty repo, label every touched surface as one of:
  - accepted production edit
  - diagnostic-only edit
  - failed-attempt edit to quarantine or roll back

## No-Op Churn Stop Order

If the user reports that the visual did not change, the current loop is failed until proven otherwise. Do not continue by adding more gates, review UI, telemetry, cache tokens, generated artifacts, or doctrine around the same unchanged visual.

Before the next visual implementation edit, the agent must:

1. Inspect the latest accepted visual evidence lane.
2. State the specific visible relationship that is still wrong.
3. Classify every current dirty surface as production visual fix, instrumentation-only, failed attempt, or blocker evidence.
4. Name the next implementation hypothesis that should produce a visible delta.

If there is no new implementation hypothesis, stop and preserve the failed attempt. Instrumentation-only churn after a no-op report is not progress and must not be described as progress.

## Current Meshy FK Quarantine

See `docs/POSE_LAB_MESHY_SABER_FAILED_CHECKPOINTS.md` for failed checkpoints that must not be reused as accepted production truth.

The current Meshy saber state is not accepted as fixed. Treat recent changes to weapon placement, visible-hilt pinning, cache tokens, offline-render green checks, and victory wording as suspect until a matrix-level FK parity diagnostic proves otherwise.

Before more Meshy weapon implementation:

1. Quarantine or roll back failed-attempt production edits that were made to chase the saber visual.
2. Add an FK matrix invariant comparing FPS and Meshy.
3. Prove that non-animated child local matrices are stable and that Meshy has no correction path FPS does not have.
4. Only then consider authored offset edits.

## Hard Rule For Future FK Work

No Pose Lab FK fix may be called fixed because:

- markers line up
- a generated offline artifact is green
- source-string tests pass
- cache tokens advanced
- a socket is locally stable under another socket

It may only be called fixed after the runtime architecture matches the stated reference and the visible failure is verified by the accepted evidence path.

For Firebase visual-truth work, the accepted evidence path is screenshot-first: inspect `generated/firebase_visual_truth/latest/tpose.png`, `ready.png`, and `ready_visual_follow.png` before citing `visual_truth.json`, telemetry, or CI. If the screenshots are red, missing, stale, too distant, or unreadable, the run is red or blocked.

Visible relationship truth is mandatory. T-pose must preserve the accepted wrist/saber relationship and default surface. Ready must visibly read as the intended hand/hilt/blade relationship. A marker, hilt coordinate, selected clip, route, or visible weapon mesh does not satisfy either relationship.

## Phone-Visible Cloud Review Rule

The Firebase artifact is not the final word if the exact URL woken on the device shows a different state. Android Chrome screenshots from the hosted Firebase URL are valid red-build evidence for route hydration, persistent UI state, and human visual readability.

An unacceptable phone-visible cloud review includes any of these:

- The URL requests Ready but the active clip, highlighted row, or visible pose is T-pose/rest.
- The UI says `REVIEW ROUTE READY` while the hand/hilt/blade relationship still reads wrong to a human.
- The saber is present but its blade axis does not read as held by the posed hand.
- A marker, hilt offset distance, or green JSON result is used to excuse a visually wrong grip.
- A share sheet, browser overlay, stale tab, or post-wake state makes the supposed proof unreadable.

When this happens, preserve the contradiction as human red-build evidence. The next implementation pass must fix the gate so the cloud artifact and phone-visible browser review converge before claiming progress.

## Lying Evidence Gate Stop Order

Do not make another Meshy FK, offset, hand-rotation, blade-axis, or pose-math edit while the current cloud review surface can still lie about actor, clip, route, or visible relationship.

The hard preflight is:

```sh
node tools/pose_lab_visual_truth_preflight.mjs
```

If it is red, the next work is evidence/UI gate repair or preservation of the failed attempt. It is not FK tuning. The preflight must stay red for:

- manual Meshy Character selection required;
- Ready URL hydrating to T-pose/rest;
- `REVIEW ROUTE OK` or `REVIEW ROUTE READY` while the visible hand/hilt/blade relationship is wrong;
- marker, hilt dot, debug line, JSON, telemetry, or workflow green used as a substitute for the real visible sword basis;
- a current commit or artifact commit listed in `evidence/human_visual_truth_red_builds.json`.

## False-Green Strike Rule

If an agent claims a visual fix is green and the user reports red from screenshot/runtime evidence, the generated proof loses authority.

The agent must:

1. Record or update an open entry in `evidence/human_visual_truth_red_builds.json`.
2. Treat `AUTHORITY_REVOKED_FALSE_GREEN` from preflight as a hard stop.
3. Avoid browser wake, green language, promotion, FK edits, offset edits, pose edits, and clip edits.
4. Repair or quarantine the lying evidence gate before any visual implementation pass.

An open strike can be closed only with `status: "superseded"`, `humanAccepted: true`, `supersededByCommit`, and `acceptedEvidencePath`. Do not delete a strike to make the gate green.

## Test Harness Recovery Rule

If tests pass while the screenshot is red, the test harness is red. Do not add more assertions that merely encode the current state. First identify whether the passing test was acceptance, diagnostic, guardrail, or quarantine. If it was acting as acceptance without human-visible cloud evidence, demote it or rewrite it.

A recovered test harness must fail for the exact false-green behavior that caused pain: metric-green / human-red, marker-only proof, stale or wrong route, offline-only proof, generated artifact promotion, or source-string proof. It must not bless the current broken state as a new golden baseline.
