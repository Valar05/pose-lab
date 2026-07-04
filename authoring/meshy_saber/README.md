# Meshy Saber Blender Authoring Lane

This folder is the escape hatch for Meshy saber work. Blender is the local terminal visual authoring/render surface; Pose Lab is only the importer/runtime verifier for exported gold.

## Source Assets

- Meshy animated rig: `assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb`
- FPS arms/reference: `assets/models/FPSPlayer.glb`
- Meshy sabre prop: `assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb`
- Optional source blend: `assets/source/FPSPlayer.blend`

## Workflow

1. From the Pose Lab repo root, probe the local terminal Blender:

   ```sh
   node tools/meshy_saber_blender_workbench.mjs --probe --json
   ```

2. Generate headless review artifacts:

   ```sh
   node tools/meshy_saber_blender_workbench.mjs --json
   ```

   This writes T-pose and Ready PNGs, an HTML contact sheet, and a transform contract under `authoring/meshy_saber/exports/`.

3. To save an editable `.blend` candidate as well, run:

   ```sh
   node tools/meshy_saber_blender_workbench.mjs --save-blend authoring/meshy_saber/meshy_ready_authoring.blend --json
   ```

4. Keep the hierarchy:

   ```text
   RightHand
     -> WeaponGrip
         -> Meshy French Revolution Sabre
   ```

5. Direct Blender invocation is still allowed for debugging the same path:

   ```sh
   blender --background --python authoring/meshy_saber/blender_build_meshy_ready_authoring.py -- --repo-root . --render-dir authoring/meshy_saber/exports/headless_review --export-json authoring/meshy_saber/exports/meshy_ready_saber_contract.json
   ```

If local Blender is unavailable, report `LOCAL_BLENDER_UNAVAILABLE`. Do not fall back to THECAULDRON or a manual UI host unless that is explicitly requested.

## Promotion Rule

Generated files under `authoring/meshy_saber/exports/` are not repo truth by themselves. A human-approved headless Blender contact sheet and the exported JSON contract must be reviewed before any Pose Lab runtime path consumes them.
