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

- **Weapon / Meshy Sword:** Firebase hosted visual truth is tier-one. A green claim requires the `.github/workflows/firebase-visual-truth.yml` preview deploy, `generated/firebase_visual_truth/latest/visual_truth.json`, and human-reviewable cloud screenshots for the landing route, accepted T-pose/rest clip, and the `OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]` Ready review clip. The agent must inspect `tpose.png`, `ready.png`, and `ready_visual_follow.png` before reporting green. Browser wake is reserved for ready-for-review artifacts: before handoff on a green artifact, the agent must wake the exact Ready capture URL from that same `visual_truth.json` on the device browser so the user lands on the current proven route, not localhost, `example.com`, a stale tab, the base `hostedUrl`, or an older Firebase preview. During red/debug inspection, do not wake Android Chrome; preserve the artifact and keep diagnosing. Hosted debug telemetry may support the read by proving `truthLedger.landingUsable === true`, `truthLedger.tposeStableIdle === true`, `truthLedger.readyBoringFk === true`, `captures[ready].evaluation.checks.hiltAwayFromRawHand === true`, and `captures[ready].evaluation.checks.readyHandOrientationSane === true`, but telemetry is not visual authority. Local Playwright is allowed only as a controller pointed at a hosted Firebase HTTPS URL; it is not itself visual truth. Direct FK parent-chain telemetry is support evidence only; it cannot greenlight a screenshot where the selected clip UI, Ready hand orientation, visible grip basis, or saber placement is wrong. Offline render, localhost capture, generated Firebase staging capture, debug bridge, and standalone `screencap` are diagnostic-only and cannot close Meshy saber acceptance.
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
- Screenshot and contact-sheet inspection comes before telemetry for visual bugs. If the visual artifact is red, missing, stale, too distant, or unreadable, the claim is red or blocked even when tests pass.
- visible relationship truth is mandatory. Name the expected relationship and actual relationship before using telemetry: default clip to visible default pose, wrist to hilt, hand to weapon, blade axis to grip, UI selected row to visible pose.
- Deprecated standalone Android `screencap`, localhost browser capture, generated-staging browser capture, debug-bridge weapon follow, and offline render are not Meshy saber acceptance evidence.
- Logic regression to avoid: running Playwright locally against a hosted Firebase URL is permitted as cloud-page control; treating local Playwright, localhost, offline render, or generated staging output as truth is not permitted.
- User screenshots remain valid red-build reports. The fix path is to make the Firebase hosted visual truth artifact reproduce and prove the same pose/weapon layer, not to spend more time on local capture.
- Human cloud-visual contradiction is a stop condition. Preserve the contradiction, inspect the cloud screenshots, and fix the gate before another success claim.
- The phone-visible hosted URL is part of cloud truth. If Android Chrome shows the Ready URL selecting T-pose/rest, or shows `REVIEW ROUTE READY` while the blade axis and grip still look wrong, the artifact is false-green. Fix route hydration and visible relationship proof before another success claim.
- Manual Meshy Character selection is red. The cloud lane must prove cold URL actor hydration with `autoLoadedMeshyFromColdUrl` and `manualActorSelectionRequiredFalse`; otherwise the page has not proven the same state the user will review.
- Before browser wake, success language, or another Meshy FK/offset edit after red screenshots, run `node tools/pose_lab_visual_truth_preflight.mjs`. If it fails, repair the evidence/UI gate or preserve the failed attempt before touching pose math.
- Every visual fix needs a positive artifact and, when practical, a negative control that proves the artifact would fail on the known bad state.
- If offline evidence is green while the user screenshot shows the saber out of hand, classify it as an offline truth mismatch and fix the offline/runtime parity layer before changing offsets.
- Generated artifacts under `generated/` are evidence output, not app code. Commit them only when a workflow explicitly declares the artifact durable.

## Current Weapon Negative Control

The Meshy weapon route must keep rejected candidates out of default/promotion surfaces:

```sh
node tools/test_pose_lab_no_bad_promotions.mjs
```

Firebase evidence is the positive acceptance gate; local tests only protect routing and promotion boundaries.
