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

4. Refresh Firebase hosted visual truth. This is the accepted Meshy saber visual truth lane:

   ```sh
   node tools/pose_lab_cloud_visual_truth_self_service.mjs
   node tools/pose_lab_cloud_visual_truth_self_service.mjs --push --wait --download --inspect
   ```

   This uses `git push` plus the pull-request-triggered Firebase workflow. Do not depend on `gh workflow run` as the default path; it is a fallback only when GitHub CLI auth is already healthy.

   The evidence must record:

   - actor;
   - clip;
   - cache token;
   - hosted Firebase URL;
   - screenshot/contact-sheet paths;
   - visible read in plain language.

   For the Meshy saber path, the accepted evidence lane is:

   - `generated/firebase_visual_truth/latest/visual_truth.json`;
   - `generated/firebase_visual_truth/latest/tpose.png`;
   - `generated/firebase_visual_truth/latest/ready.png`;
   - `generated/firebase_visual_truth/latest/ready_visual_follow.png`.

   The Firebase parity target is simultaneous hosted truth: the accepted T-pose/rest saber baseline stays stable, and Ready boring FK moves the visible saber with the hand.

5. Rerun:

   ```sh
   node tools/pose_lab_case.mjs verify --case visual-truth-parity --json
   ```

## Acceptance

`visual-truth-parity` can go green only when the Firebase visual truth artifact is current and both hosted captures pass.

For the Meshy saber, freshness alone is not enough. Firebase evidence must show the real sabre mesh rendered, the requested hosted clips applied, stable T-pose hilt/rotation values preserved, and Ready hand/tip motion proving the saber follows boring FK.

## Forbidden Shortcuts

- Do not use deprecated standalone Android `screencap` as acceptance evidence.
- Do not use local browser capture, offline render, or debug-bridge `weapon visual-follow` as Meshy saber acceptance evidence.
- Do not treat source-string tests as visual proof.
- Do not close a user screenshot red build with debug bridge telemetry.
- Do not ignore cache token mismatch.
