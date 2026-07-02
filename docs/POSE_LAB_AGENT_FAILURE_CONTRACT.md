# Pose Lab Agent Failure Contract

This document exists because the Meshy saber FK work caused unacceptable user pain. Future Pose Lab agents must treat it as an operating contract, not background reading.

## Controlling Instruction

For the Meshy saber problem, the controlling instruction is:

> Meshy must be FPS weapon FK plus authored offsets, nothing else.

That means the architecture must match FPS first. Do not tune offsets, markers, or visual landmarks until FPS-vs-Meshy FK parity is proven at the parent/local-matrix level.

## Pain Mined From The Failed Session

- The user repeatedly asked for simple FK identical to FPS except authored offsets, and the agent kept solving narrower symptoms.
- The agent accepted marker, socket, cache-token, and generated-artifact evidence while the user repeatedly reported unchanged screenshots.
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
- Do not write victory documentation for unaccepted visual changes.
- In a dirty repo, label every touched surface as one of:
  - accepted production edit
  - diagnostic-only edit
  - failed-attempt edit to quarantine or roll back

## Current Meshy FK Quarantine

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
