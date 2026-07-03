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

The evidence target is:

```text
generated/firebase_visual_truth/latest/visual_truth.json
```

Screenshots and hosted debug telemetry are workflow artifacts, not local Android evidence. The artifact is the engineering gate for Meshy saber acceptance: `ok` may be true only when T-pose stable idle and Ready boring FK both pass in the hosted Firebase browser.

Known working checkpoint:

- Commit: `22e87926b73e5a4623154a39c8a682517af94f09`
- GitHub Actions run: `28632638640`
- Hosted preview: `https://pose-lab-visual-truth--visual-truth-28632638640-eprz32rp.web.app`
- Artifact: `firebase-visual-truth`
- Captures: `tpose.png`, `ready.png`, `visual_truth.json`
- Runtime route: Meshy Character selected for both configured clips.

## Rule

Do not use Firebase/cloud screenshots to tune offsets blindly. Use them to establish hosted visual truth. If the hosted screenshot or telemetry is red, preserve the red evidence and fix the layer identified by the Firebase artifact. Offline render is diagnostic-only and cannot override Firebase truth.
