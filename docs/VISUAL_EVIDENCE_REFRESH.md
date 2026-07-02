# Visual Evidence Refresh

Use this when `visual-truth-parity` is red because visual evidence is stale or missing.

## Goal

Refresh user-facing evidence without falling back to deprecated standalone `screencap`, browser capture, or debug-bridge proof.

## Procedure

1. Check workflow state:

   ```sh
   node tools/pose_lab_doctor.mjs --json
   ```

2. Confirm the durable server:

   ```sh
   tmux list-sessions
   curl -I http://127.0.0.1:8798/pose-lab/pose-lab.html
   ```

3. Open the exact case route:

   ```sh
   node tools/pose_lab_case.mjs route --case visual-truth-parity
   ```

4. Refresh the offline pose+weapon evidence. This is the accepted Meshy saber visual truth lane:

   ```sh
   node tools/refresh_pose_lab_offline_visual_evidence.mjs
   ```

   The evidence must record:

   - actor;
   - clip;
   - cache token;
   - artifact path;
   - visible read in plain language.

   For the Meshy saber path, the accepted evidence lane is:

   - `captureKind: offline-pose-render` in `generated/visual_red_build/pose_lab_latest.json`;
   - `generated/pose_lab_offline_render/visual_red_build_tpose/pose_weapon_render.png`;
   - `generated/pose_lab_offline_render/visual_red_build_tpose/pose_weapon_render.json`.

   The offline parity target is the authored `WeaponR -> WeaponGrip` FK chain plus the real sabre mesh. Raw hand and palm distances remain diagnostics to prove the hard-won displacement was not collapsed or hidden by a socket-only proof.

5. Rerun:

   ```sh
   node tools/pose_lab_case.mjs verify --case visual-truth-parity --json
   ```

## Acceptance

`visual-truth-parity` can go green only when `visual-red-build-contract` passes and the case verdict names current evidence artifacts.

For the Meshy saber, freshness alone is not enough. The offline evidence must show the real sabre mesh rendered, the generated clip resolved, the requested clip applied, the hilt pinned to `WeaponGrip`, finite hand/hilt distances, and blade direction matching mapped FPS `Weapon.R`.

## Forbidden Shortcuts

- Do not use deprecated standalone Android `screencap` as acceptance evidence.
- Do not use browser capture or debug-bridge `weapon visual-follow` as Meshy saber acceptance evidence.
- Do not treat source-string tests as visual proof.
- Do not close a user screenshot red build with debug bridge telemetry.
- Do not ignore cache token mismatch.
