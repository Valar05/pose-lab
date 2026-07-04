# Blender-First Meshy Saber Workflow

Pose Lab is no longer the authoring surface for Meshy saber placement. It may verify imported results, but the human-visible weapon hold is authored and rendered through local terminal Blender first.

This workflow is the first layer of `docs/POSE_LAB_VISUAL_AUTHORITY_LADDER.md`.

## Authority

The accepted source of truth is a human-approved local Blender review artifact showing:

- Meshy T-pose/rest canary remains sane.
- Meshy Ready reads as holding the sabre.
- `RightHand -> WeaponGrip -> Meshy French Revolution Sabre` is visible and inspectable.

Metrics, browser telemetry, cloud screenshots, and offline renderers are supporting evidence after import. They do not author the pose and they do not override the Blender-approved result.

## Build Headless Review Artifacts

Use terminal-runnable local Blender first. The workbench checks direct host Blender first, then the same Debian proot pattern used by TFTM: `proot-distro login debian -- blender`. Do not require a UI and do not route to THECAULDRON unless explicitly requested.

```sh
node tools/meshy_saber_blender_workbench.mjs --probe --json
node tools/meshy_saber_blender_workbench.mjs --json
```

The workbench writes:

- `authoring/meshy_saber/exports/headless_review/meshy_saber_tpose.png`
- `authoring/meshy_saber/exports/headless_review/meshy_saber_ready.png`
- `authoring/meshy_saber/exports/headless_review/meshy_saber_contact_sheet.html`
- `authoring/meshy_saber/exports/meshy_ready_saber_contract.json`

If local/proot Blender is missing or cannot render, stop with `LOCAL_BLENDER_UNAVAILABLE` or `HEADLESS_BLENDER_FAILED`. Do not tune `src/rig-profiles.js` to compensate for a missing authoring artifact.

## Export Contract

Direct Blender invocation is the same path:

```sh
blender --background --python authoring/meshy_saber/blender_build_meshy_ready_authoring.py -- --repo-root . --render-dir authoring/meshy_saber/exports/headless_review --export-json authoring/meshy_saber/exports/meshy_ready_saber_contract.json
```

The export is still candidate material until a human approves the Blender review artifacts. Generated exports under `authoring/meshy_saber/exports/` should not be committed casually.

## Thin Cloud Review

If the user cannot see it, it does not count. Publish the headless Blender artifacts through the thin cloud layer instead of the full Pose Lab runtime:

```sh
node tools/build_meshy_saber_blender_cloud_review.mjs
firebase hosting:channel:deploy meshy-saber-blender --project home-center-dclar --config generated/firebase_hosting/meshy_saber_blender_review/firebase.json --expires 7d
```

This deploys only the two Blender PNGs, the contact sheet, the contract JSON, and a small `index.html`. It is visible evidence, not Pose Lab runtime acceptance.

Before any Pose Lab runtime fix or browser wake, run:

```sh
node tools/pose_lab_recovery_gate.mjs --json
```

## Pose Lab Import Rule

When Pose Lab consumes this lane, it must import the Blender-authored hierarchy and transforms directly. It must not retarget, solve, run `WeaponR` parity, or tune offsets to make the Blender export appear correct.
