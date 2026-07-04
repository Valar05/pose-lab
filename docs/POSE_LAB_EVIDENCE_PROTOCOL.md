# Pose Lab Evidence Protocol

Use this protocol before changing Pose Lab in response to a visual or animation bug. It is a routing layer: pick the evidence lane first, then edit.

First read the [Pose Lab Visual Authority Ladder](POSE_LAB_VISUAL_AUTHORITY_LADDER.md). For Meshy saber work the order is Blender authoring truth, Pose Lab import truth, diagnostics/guardrails, Cloud presentation proof, and user screenshot veto.

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

- **Weapon / Meshy Sword:** Blender viewport approval is authoring truth, Pose Lab import is reproduction truth, and Firebase hosted visual truth is final cloud presentation proof. A green browser claim requires a human-approved Blender contract, a verified Pose Lab import of that contract, the `.github/workflows/firebase-visual-truth.yml` preview deploy, `generated/firebase_visual_truth/latest/visual_truth.json`, cloud screenshots for the accepted T-pose/rest clip and Ready clip, and hosted debug telemetry proving both `truthLedger.tposeStableIdle === true` and `truthLedger.readyBoringFk === true`. Offline render, local browser capture, debug bridge, source-string tests, and standalone `screencap` are diagnostic-only and cannot close Meshy saber acceptance.
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
- Every Meshy saber check must be understood as acceptance, diagnostic, guardrail, or quarantine evidence. See `contracts/meshy_saber_evidence_roles.json`.
- Deprecated standalone Android `screencap`, local browser capture, debug-bridge weapon follow, and offline render are not Meshy saber acceptance evidence.
- User screenshots remain valid red-build reports. The fix path is to make the Firebase hosted visual truth artifact reproduce and prove the same pose/weapon layer, not to spend more time on local capture.
- After the Blender-first pivot, do not use Firebase/cloud screenshots to author or tune Meshy saber placement. Use them to verify hosted presentation of the approved Blender/Pose Lab import result.
- Every visual fix needs a positive artifact and, when practical, a negative control that proves the artifact would fail on the known bad state.
- If offline evidence is green while the user screenshot shows the saber out of hand, classify it as an offline truth mismatch and fix the offline/runtime parity layer before changing offsets.
- Generated artifacts under `generated/` are evidence output, not app code. Commit them only when a workflow explicitly declares the artifact durable.

## Current Weapon Negative Control

The Meshy weapon route must keep rejected candidates out of default/promotion surfaces:

```sh
node tools/test_pose_lab_no_bad_promotions.mjs
```

Firebase evidence is the positive presentation gate; local tests only protect routing and promotion boundaries.

Before a browser wake or green claim, run:

```sh
node tools/pose_lab_recovery_gate.mjs --json
```
