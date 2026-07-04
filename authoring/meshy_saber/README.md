# Meshy Saber Blender Authoring Lane

This folder is the escape hatch for Meshy saber work. Blender is the manual visual authoring surface; Pose Lab is only the importer/runtime verifier for exported gold.

## Source Assets

- Meshy animated rig: `assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb`
- FPS arms/reference: `assets/models/FPSPlayer.glb`
- Meshy sabre prop: `assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb`
- Optional source blend: `assets/source/FPSPlayer.blend`

## Workflow

1. Open Blender 4.4.3 or newer on THECAULDRON.
2. From the Pose Lab repo root, run:

   ```sh
   blender --background --python authoring/meshy_saber/blender_build_meshy_ready_authoring.py -- --repo-root . --save-blend authoring/meshy_saber/meshy_ready_authoring.blend
   ```

3. Open `authoring/meshy_saber/meshy_ready_authoring.blend`.
4. In Pose Mode, manually author Meshy T-pose and Ready so the viewer believes the sabre is held by the right hand.
5. Keep the hierarchy:

   ```text
   RightHand
     -> WeaponGrip
         -> Meshy French Revolution Sabre
   ```

6. Export the approved result:

   ```sh
   blender --background authoring/meshy_saber/meshy_ready_authoring.blend --python authoring/meshy_saber/blender_build_meshy_ready_authoring.py -- --repo-root . --export-json authoring/meshy_saber/exports/meshy_ready_saber_contract.json --export-glb authoring/meshy_saber/exports/meshy_ready_saber.glb
   ```

## Promotion Rule

Generated files under `authoring/meshy_saber/exports/` are not repo truth by themselves. A human-approved Blender viewport screenshot and the exported JSON contract must be reviewed before any Pose Lab runtime path consumes them.

