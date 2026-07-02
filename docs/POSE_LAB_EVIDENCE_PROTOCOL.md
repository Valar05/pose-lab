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
node tools/pose_lab_route.mjs --kind weapon-fk --actor meshyCharacter --clip "OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]" --json
```

Change `--kind` to `cache-server`, `pose-retarget`, `ui-state`, `promotion`, or `live-visual` when the bug is not a weapon FK issue.

## Evidence Lanes

- **Weapon FK / Meshy Sword:** `tools/pose_lab_offline_render.mjs` is the tier-one visual truth path. A green claim requires `node tools/refresh_pose_lab_offline_visual_evidence.mjs`, the real sabre mesh, current generated clip, direct `RightHand -> WeaponGrip -> displayRoot -> sabre mesh` parent chain, hilt displacement from raw hand, hilt pinning to `WeaponGrip`, `WeaponGrip` local position/quaternion stability under `RightHand`, finite hand/hilt distances, no normal Meshy `WeaponR`/`WeaponGrip` weapon tracks, and `node tools/test_pose_lab_visual_red_build_contract.mjs` passing. FPS `Weapon.R` is reference-only for Meshy and must not gate green acceptance. Browser capture, debug bridge, and standalone `screencap` are deprecated for Meshy saber acceptance.
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
- Deprecated standalone Android `screencap`, browser capture, and debug-bridge weapon follow are not Meshy saber acceptance evidence.
- User screenshots remain valid red-build reports. The fix path is to make the offline renderer reproduce and prove the same pose/weapon layer, not to spend more time on live capture.
- Every visual fix needs a positive artifact and, when practical, a negative control that proves the artifact would fail on the known bad state.
- If offline evidence is green while the user screenshot shows the saber out of hand, classify it as an offline truth mismatch and fix the offline/runtime parity layer before changing offsets.
- Generated artifacts under `generated/` are evidence output, not app code. Commit them only when a workflow explicitly declares the artifact durable.

## Current Weapon Negative Control

The Meshy weapon route must reject this command:

```sh
node tools/pose_lab_offline_render.mjs --fault collapse-displacement --samples 2
```

It simulates the previous failure where the hilt collapsed onto the wrist/`RightHand` origin. The artifact must report `ok: false` and `checks.appliedHiltAwayFromRawHand: false`.
