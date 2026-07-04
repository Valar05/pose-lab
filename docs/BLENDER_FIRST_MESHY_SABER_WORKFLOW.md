# Blender-First Meshy Saber Workflow

Pose Lab is no longer the authoring surface for Meshy saber placement. It may verify imported results, but the human-visible weapon hold is authored in Blender first.

## Authority

The accepted source of truth is a human-approved Blender viewport showing:

- Meshy T-pose/rest canary remains sane.
- Meshy Ready reads as holding the sabre.
- `RightHand -> WeaponGrip -> Meshy French Revolution Sabre` is visible and inspectable.

Metrics, browser telemetry, cloud screenshots, and offline renderers are supporting evidence after import. They do not author the pose and they do not override the Blender-approved result.

## Build The Authoring Scene

Use Blender 4.4.3 or newer on THECAULDRON. The Android/Termux Blender path has historically inspected `.blend` files but failed on exporter dependencies.

```sh
blender --background --python authoring/meshy_saber/blender_build_meshy_ready_authoring.py -- --repo-root . --save-blend authoring/meshy_saber/meshy_ready_authoring.blend
```

Open the saved file in Blender and author the visible pose manually. Do not tune `src/rig-profiles.js` while doing this.

## Export Contract

After visual approval, export a contract JSON and optional GLB:

```sh
blender --background authoring/meshy_saber/meshy_ready_authoring.blend --python authoring/meshy_saber/blender_build_meshy_ready_authoring.py -- --repo-root . --export-json authoring/meshy_saber/exports/meshy_ready_saber_contract.json --export-glb authoring/meshy_saber/exports/meshy_ready_saber.glb
```

The export is still candidate material until a human approves the Blender screenshots. Generated exports under `authoring/meshy_saber/exports/` should not be committed casually.

## Pose Lab Import Rule

When Pose Lab consumes this lane, it must import the Blender-authored hierarchy and transforms directly. It must not retarget, solve, run `WeaponR` parity, or tune offsets to make the Blender export appear correct.

