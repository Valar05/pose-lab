# Firebase Visual Truth

Use this lane when local Android/browser capture, debug bridge capture, or localhost automation cannot be trusted.

## Current Infrastructure

- GCP/Firebase project: `home-center-dclar`
- Firebase Hosting site: `pose-lab-visual-truth`
- Default live URL: `https://pose-lab-visual-truth.web.app`
- Preview channel used for manual bootstrap: `visual-truth`
- GitHub secret for CI deploys: `FIREBASE_SERVICE_ACCOUNT_HOME_CENTER_DCLAR`

## Local Bootstrap

```sh
node tools/build_firebase_pose_lab_release.mjs
node tools/test_firebase_hosting_config.mjs
firebase hosting:channel:deploy visual-truth --project home-center-dclar --expires 30d
```

The build script stages only the static runtime surface needed by Pose Lab:

- `index.html`
- `pose-lab.html`
- `pose-critique.html`
- `src/`
- `vendor/`
- selected Meshy/FPS/sabre runtime assets from `assets/models/`
- `assets/asset_manifest.json`

Do not deploy the repository root directly.

## Self-Service Cloud Loop

Use the repo-owned self-service tool instead of one-off workflow dispatch commands:

```sh
node tools/pose_lab_cloud_visual_truth_self_service.mjs
node tools/pose_lab_cloud_visual_truth_self_service.mjs --commit-message "Fix Meshy Ready blade proof" --push --wait --download --inspect
node tools/pose_lab_cloud_visual_truth_self_service.mjs --push --wait --download --inspect
```

Use the `--commit-message` form for normal agent loops. It stages tracked edits with `git add -u`, commits them, pushes, polls the PR-triggered Firebase workflow, downloads the artifact, and runs the inspector. If the artifact is green/ready, the tool wakes the exact Ready capture URL. If the artifact is red, the tool preserves the PNG/JSON evidence and does not wake the Android browser. If a brand-new source/doc/tool file must be included, add it explicitly with `--include path/to/file`; generated Firebase artifacts stay untracked unless deliberately named.

The normal path is:

1. run the self-service tool with `--commit-message ... --push --wait --download --inspect`;
2. let the pull-request-triggered Firebase workflow run;
3. let the self-service tool poll, download, and inspect the artifact;
4. run or rely on `node tools/pose_lab_visual_truth_preflight.mjs` before any wake or green language;
5. visually inspect the printed PNG paths before reporting pass;
6. after the artifact is green/ready and preflight is green, wake the exact Ready capture URL from that artifact on the device browser.

Browser wake is a ready-for-review action, not a debugging step. Always wake the same cloud route used by the Ready screenshot before handing work back when the artifact is green/ready. Never wake Android Chrome for red/debug artifacts just to inspect telemetry. Do not open `example.com`, localhost, a generic Firebase site root, the base `hostedUrl`, or a remembered older preview URL. The URL to wake is `captures[id="ready"].url` in the downloaded `visual_truth.json`; it includes `/pose-lab.html` plus the actor, QA actor, weapon debug, and cache-bust query parameters. Use `captures[id="tpose"].url` only when the Ready capture is missing.

Manual Meshy Character selection is red. The cloud artifact must explicitly prove cold URL actor hydration with `autoLoadedMeshyFromColdUrl` and `manualActorSelectionRequiredFalse` before wake or promotion. A page that becomes Ready only after human actor selection is a route-hydration failure, not a reviewable artifact.

Use the stable one-command browser wake wrapper when a green artifact already exists:

```sh
node tools/wake_pose_lab_ready_cloud_url.mjs
```

Manual `gh workflow run firebase-visual-truth.yml` is a fallback only when GitHub CLI auth is known good. It is not the default path.

## Cleanup Doctrine

Do not ask for approval to hand-delete temp/cache paths, and do not use ad hoc `rm` as the workflow. Cache cleanup must go through the allowlisted script:

```sh
node tools/clean_pose_lab_cache.mjs --target firebase-visual-truth --apply
node tools/clean_pose_lab_cache.mjs --target firebase-hosting --apply
node tools/clean_pose_lab_cache.mjs --target browser-prune --apply
```

The script is allowed to remove declared project `generated/` cache and matching Termux tmp folders. Add a new allowlisted target to the script when a new cache family appears.

## Hosted Capture

The GitHub workflow `.github/workflows/firebase-visual-truth.yml` deploys a Firebase preview channel and captures T-pose plus Ready screenshots with Playwright from GitHub-hosted Linux.

The workflow intentionally does not use `actions/checkout` with `lfs: true`. This repository has legacy LFS pointers whose objects are missing from GitHub, and broad LFS checkout fails before visual truth can run. The workflow pulls only the Meshy runtime assets required by this lane:

- `assets/models/meshy_character_sheet/**`
- `assets/models/meshy_sabre/**`

Those assets are size-checked before staging so pointer files cannot silently deploy.

Local Playwright may be used as a controller only when the loaded page is a hosted Firebase HTTPS URL such as `https://pose-lab-visual-truth--...web.app`. Controller location is not truth location. A local Playwright pass against localhost, offline render output, or `generated/firebase_hosting/pose_lab_release` is diagnostic-only and cannot promote a Meshy saber visual fix.

## Visual Authority

Firebase visual truth is a screenshot-first lane.

Before reporting a Firebase run green, inspect the cloud artifact images:

- `generated/firebase_visual_truth/latest/tpose.png`
- `generated/firebase_visual_truth/latest/ready.png`
- `generated/firebase_visual_truth/latest/ready_visual_follow.png`

The JSON summary and hosted debug telemetry explain what the page reported. They do not certify visual acceptance by themselves.

If the cloud screenshots show a red build, the run is red even when `visual_truth.json`, CI, or telemetry says `ok: true`.

visible relationship truth controls this lane. If the object is present but the relationship is wrong, the run is red. T-pose must preserve the accepted wrist/saber relationship and default visible surface. Ready must visibly read as the intended hand/hilt/blade relationship. Actor selection, clip selection, marker placement, and weapon visibility are support evidence only.

If the screenshots are missing, stale, too distant, cropped badly, or unreadable for the visual question, the run is blocked, not green.

If the human reports the cloud visual as red, stop promotion and preserve the contradiction until the screenshots and gate explain it.

The exact URL woken on Android Chrome is part of the Firebase review. If that phone-visible page disagrees with the artifact, the result is red even when the workflow concluded success. A common false-green is: the artifact JSON says Ready passed, but the device screenshot shows the Ready URL rendering T-pose/rest first, or later shows `REVIEW ROUTE READY` while the blade axis and grip still do not read as a sane human-held Ready pose. The next loop must make the artifact, the woken URL, and the human screenshot converge; do not answer with telemetry or distance metrics alone.

The order-of-operations contract is: red screenshot -> state visible contradiction -> fix lying evidence/UI gate -> prove the gate catches it -> then edit FK or pose math. Do not spend cloud cycles or FK edits while the preflight is red.

The evidence target is:

```text
generated/firebase_visual_truth/latest/visual_truth.json
```

Screenshots and hosted debug telemetry are workflow artifacts, not local Android evidence. The artifact is the engineering gate for Meshy saber acceptance: `ok` may be true only when the landing page is usable, T-pose stable idle passes, Ready boring FK passes, and no human red-build veto exists for the commit. Ready must also prove the visible hand/grip basis is sane: the authored grip offset and applied hilt cannot collapse onto the raw wrist/hand, even if direct FK parent-chain telemetry is stable.

The gate must also record `defaultSurfaceAccepted`, `tposeWristRelationshipAccepted`, and `readyVisualRelationshipAccepted`. Until those are true, a cloud artifact is preservation or diagnosis, not progress.

The landing usability threshold is a cold hosted-cloud review budget and friction signal, not a visual correctness metric. Slow load should be reported and improved, but it does not by itself prove or disprove T-pose or Ready FK correctness. Ready/T-pose visual parity is judged by the dedicated captures and human visual review.

A cloud workflow success, UI truth page, or green JSON result is not progress after a human no-op report unless it introduces a new accepted visual artifact that shows the target relationship changed correctly. Before another paid/cloud loop after a red-build or no-op report, record the visual hypothesis, the artifact that will answer it, and the stop condition. If the run cannot answer a new visual question, do not spend it.

False-pass checkpoint preserved for regression:

- Commit: `9bf57c6da686c6baf7594ddcf5ce29237bd3b494`
- GitHub Actions run: `28635928905`
- Hosted preview: `https://pose-lab-visual-truth--visual-truth-28635928905-qd6mehpu.web.app`
- Artifact: `firebase-visual-truth`
- Captures: `tpose.png`, `ready.png`, `ready_visual_follow.png`, `visual_truth.json`
- Runtime route: Meshy Character selected for both configured clips, but human screenshot truth was red: Ready hand orientation/grip basis was wrong and the hilt/marker collapsed around the wrist. This run must never be treated as an accepted green.

Logic-regression checkpoint preserved for regression:

- Commit: `3fc1b14d525c71f60fc4c90069a597944e4f751f`
- GitHub Actions run: `28638735919`
- Hosted preview: `https://pose-lab-visual-truth--visual-truth-28638735919-yew7srj2.web.app`
- Human live Firebase review was red: slow page load, missing expected clips, and the visible Ready clip was wrong.
- Follow-up rule: the capture controller may be local Playwright, but only the hosted Firebase page plus matching commit/cache identity can contribute visual truth.

Cloud-screenshot false-green checkpoint preserved for regression:

- Commit: `c30d87125de6d5e0eaabeb5961c32b2fe1c679d0`
- GitHub Actions run: `28640974375`
- Hosted preview: `https://pose-lab-visual-truth--visual-truth-28640974375-g6thxcam.web.app/`
- Human and screenshot review were red: `ready.png` showed an unacceptable Ready pose, wrong right-hand/grip basis, a saber hanging down-left instead of reading as a sane ready grip, and inconsistent selected-clip UI. `ready_visual_follow.png` was too distant and marker-heavy to prove visual parity.
- Follow-up rule: a Firebase run may not pass until the cloud screenshots themselves prove the visual claim. Telemetry, marker checks, and `ok: true` are insufficient.

Phone-wake false-green checkpoint preserved for regression:

- Commit: `a92fa0bb6dc5b83644688db2d8b04d7c9b2f56b5`
- GitHub Actions run: `28649227859`
- Hosted preview: `https://pose-lab-visual-truth--visual-truth-pr-28649227859-lqwd19b7.web.app/`
- Human Android screenshots: `/storage/emulated/0/Pictures/Screenshots/Screenshot_20260703-094627.png` and `/storage/emulated/0/Pictures/Screenshots/Screenshot_20260703-094631.png`
- Human review was red: the first screenshot shows the Ready URL with `REVIEW RED` because the active visible clip is T-pose/rest; the second screenshot shows `REVIEW ROUTE READY`, but the blade/hilt relationship still does not read as an accepted Ready hand-held saber pose.
- Follow-up rule: artifact green is not sufficient if the phone-visible cloud URL hydrates to a contradictory or human-red state. The gate must prove the exact woken URL, highlighted clip row, review banner, body pose, hilt position, and blade axis agree.

Manual-load false-green checkpoint preserved for regression:

- Branch commit: `22081ceb305efe1e472fff841f72be84ff303fa3`
- Artifact commit: `9e809fca6610cdacc5df7a18298c03824b447a75`
- Hosted preview: `https://pose-lab-visual-truth--visual-truth-pr-1-rcoxld17.web.app/`
- Human Android screenshots: `/storage/emulated/0/Pictures/Screenshots/Screenshot_20260703-125148.png` and `/storage/emulated/0/Pictures/Screenshots/Screenshot_20260703-125153.png`
- Human review was red: the phone-visible URL first showed T-pose/rest for the Ready route, the user had to manually load Meshy Character, and the later Ready route still showed a broken sword FK relationship. The gate must never pass from route labels, marker lines, or JSON while manual actor selection or visible sword-basis failure remains.

## Rule

Do not use Firebase/cloud screenshots to tune offsets blindly. Use them to establish hosted visual truth. If the hosted screenshot is red, preserve the red evidence and fix the layer identified by the Firebase artifact. If telemetry is green while the hosted screenshot is red, the telemetry gate is broken. Direct FK, marker pinning, source-string tests, or `ok: true` summaries cannot override a visible hand-orientation, grip-collapse, missing-clip, or bad-saber failure. Offline render is diagnostic-only and cannot override Firebase truth.
