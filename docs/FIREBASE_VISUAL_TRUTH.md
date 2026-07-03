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

The evidence target is:

```text
generated/firebase_visual_truth/latest/visual_truth.json
```

Screenshots are workflow artifacts, not local Android evidence. Human review still decides whether the hosted screenshot is visually green.

## Rule

Do not use Firebase/cloud screenshots to tune offsets blindly. Use them to establish hosted visual truth. If the hosted screenshot is red, preserve the red evidence and fix the layer identified by repo/runtime/offline/hosted disagreement.
