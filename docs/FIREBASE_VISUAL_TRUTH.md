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
- `assets/models/`
- `assets/asset_manifest.json`

Do not deploy the repository root directly.

## Hosted Capture

The GitHub workflow `.github/workflows/firebase-visual-truth.yml` deploys a Firebase preview channel and captures T-pose plus Ready screenshots with Playwright from GitHub-hosted Linux.

The workflow intentionally does not use `actions/checkout` with `lfs: true`. This repository has legacy LFS pointers whose objects are missing from GitHub, and broad LFS checkout fails before visual truth can run. The workflow pulls only the Meshy runtime assets required by this lane:

- `assets/models/meshy_character_sheet/**`
- `assets/models/meshy_sabre/**`

Those assets are size-checked before staging so pointer files cannot silently deploy.

Local Playwright may be used as a controller only when the loaded page is a hosted Firebase HTTPS URL such as `https://pose-lab-visual-truth--...web.app`. Controller location is not truth location. A local Playwright pass against localhost, offline render output, or `generated/firebase_hosting/pose_lab_release` is diagnostic-only and cannot promote a Meshy saber visual fix.

The evidence target is:

```text
generated/firebase_visual_truth/latest/visual_truth.json
```

Screenshots and hosted debug telemetry are workflow artifacts, not local Android evidence. The artifact is the engineering gate for Meshy saber acceptance: `ok` may be true only when the landing page is usable, T-pose stable idle passes, Ready boring FK passes, and no human red-build veto exists for the commit. Ready must also prove the visible hand/grip basis is sane: the authored grip offset and applied hilt cannot collapse onto the raw wrist/hand, even if direct FK parent-chain telemetry is stable.

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

## Rule

Do not use Firebase/cloud screenshots to tune offsets blindly. Use them to establish hosted visual truth. If the hosted screenshot or telemetry is red, preserve the red evidence and fix the layer identified by the Firebase artifact. Direct FK, marker pinning, or source-string tests cannot override a visible hand-orientation or grip-collapse failure. Offline render is diagnostic-only and cannot override Firebase truth.
