# Pose Lab Evidence Protocol

Use this protocol before changing Pose Lab in response to a visual or animation bug. It is a routing layer: pick the evidence lane first, then edit.

## First Command

For named recurring problems, start with the case workflow:

```sh
node tools/pose_lab_case.mjs list
node tools/pose_lab_case.mjs verify --case meshy-weapon-fk-pinning
```

Use `--run-checks` only when you want the case to execute its heavier verifier commands. The default case verification still writes a route/verdict evidence pack and checks declared artifacts.

If the problem does not have a case yet, route it first:

```sh
node tools/pose_lab_route.mjs --kind weapon-fk --actor meshyCharacter --clip "OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]" --json
```

Change `--kind` to `cache-server`, `pose-retarget`, `ui-state`, `promotion`, or `live-visual` when the bug is not a weapon FK issue.

## Evidence Lanes

- **Weapon / Meshy Sword:** Firebase hosted visual truth is tier-one. A green claim requires the `.github/workflows/firebase-visual-truth.yml` preview deploy, `generated/firebase_visual_truth/latest/visual_truth.json`, cloud screenshots for the accepted T-pose/rest clip and Ready clip, and hosted debug telemetry proving `truthLedger.tposeStableIdle === true`, `truthLedger.readyBoringFk === true`, `captures[ready].evaluation.checks.hiltAwayFromRawHand === true`, and `captures[ready].evaluation.checks.readyHandOrientationSane === true`. Direct FK parent-chain telemetry is support evidence only; it cannot greenlight a screenshot where the Ready hand orientation or visible grip basis is wrong. Offline render, local browser capture, debug bridge, and standalone `screencap` are diagnostic-only and cannot close Meshy saber acceptance.
- **Cache / Server:** `tools/test_no_cache_server_contract.mjs`, `tmux ls`, and `curl -I` prove served build identity. Do this before reasoning about stale browser visuals.
- **Pose / Retarget:** `tools/pose_lab_workflow_status.mjs` and the relevant retarget contract decide whether a candidate may affect accepted surfaces.
- **UI State:** live browser evidence, visual QA, or debug snapshots may diagnose panel/control problems. They do not decide Meshy saber FK acceptance.
- **Promotion:** `tools/promote_pose_candidate.mjs` is the only path to accepted Meshy/FPS baseline changes.

## Case Ownership

- Active case specs live under `cases/`.
- Case verification output lives under `generated/cases/<case-id>/latest/`.
- Accepted manual/golden behavior lives under `contracts/`.
- Browser/runtime code stays in the existing root and `src/` paths until the app/core/evidence split has compatibility wrappers.

## Proof Rules

- Source-string tests are support-only for visual bugs. They may protect wiring, but they do not prove rendering, pose, hilt placement, or user-facing state.
- Deprecated standalone Android `screencap`, local browser capture, debug-bridge weapon follow, and offline render are not Meshy saber acceptance evidence.
- User screenshots remain valid red-build reports. The fix path is to make the Firebase hosted visual truth artifact reproduce and prove the same pose/weapon layer, not to spend more time on local capture.
- Every visual fix needs a positive artifact and, when practical, a negative control that proves the artifact would fail on the known bad state.
- If offline evidence is green while the user screenshot shows the saber out of hand, classify it as an offline truth mismatch and fix the offline/runtime parity layer before changing offsets.
- Generated artifacts under `generated/` are evidence output, not app code. Commit them only when a workflow explicitly declares the artifact durable.

## Current Weapon Negative Control

The Meshy weapon route must keep rejected candidates out of default/promotion surfaces:

```sh
node tools/test_pose_lab_no_bad_promotions.mjs
```

Firebase evidence is the positive acceptance gate; local tests only protect routing and promotion boundaries.
