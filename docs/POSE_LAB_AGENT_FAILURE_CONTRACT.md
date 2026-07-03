# Pose Lab Agent Failure Contract

This document exists because the Meshy saber FK work caused unacceptable user pain. Future Pose Lab agents must treat it as an operating contract, not background reading.

## Controlling Instruction

For the Meshy saber problem, the controlling instruction is:

> Meshy must be FPS weapon FK plus authored offsets, nothing else.

That means the architecture must match FPS first. Do not tune offsets, markers, or visual landmarks until FPS-vs-Meshy FK parity is proven at the parent/local-matrix level.

## Pain Mined From The Failed Session

- The user repeatedly asked for simple FK identical to FPS except authored offsets, and the agent kept solving narrower symptoms.
- The agent accepted marker, socket, cache-token, and generated-artifact evidence while the user repeatedly reported unchanged screenshots.
- The agent accepted Firebase telemetry and green workflow status before inspecting the cloud screenshots that were supposed to be the visual authority.
- The agent later inspected the screenshots but still accepted object/clip/marker presence as visual proof while missing the visible relationship failures: mutated T-pose wrist/saber relationship and non-accepted Ready hand/sword relationship.
- The agent edited placement literals before proving that Meshy and FPS shared the same weapon architecture.
- The agent documented and implied fixed states before the user accepted the visual result.
- The agent let tests encode the broken Meshy-specific design, then used those tests as proof.
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
- Do not write victory documentation for unaccepted visual changes.
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
