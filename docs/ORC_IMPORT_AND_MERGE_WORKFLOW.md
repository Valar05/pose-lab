# Orc Import And Merge Workflow

Use this path when bringing new downloaded FBX clips onto the Infinite Brutality Orc preset inside Pose Lab.

## Asset Layout

- Source archives: `assets/source/orc_berserker/import_packs/`
- Runtime candidate clips: `assets/models/orc_berserker/imported/`
- Orc preset wiring: `src/rig-profiles.js`
- Provenance: `assets/asset_manifest.json`

## Import Policy

1. Keep the original download ZIP under `assets/source/orc_berserker/import_packs/`.
2. Extract runtime FBX files into `assets/models/orc_berserker/imported/` with stable lowercase filenames.
3. Add those FBX paths to the Orc profile `extraClipUrls` so the preset loads them automatically.
4. Do not treat imported clips as game-ready until they survive Cleanup or Merge in the lab.

## Merge Tool

The Cleanup panel now owns clip merging too.

1. Play the clip you want as clip A, then tap `Use Active A` if needed.
2. Pick clip B from the merge dropdown.
3. Drag `Blend In` and `Blend Out` on the merge timeline like a two-stop gradient.
4. Tap `Build Merge` to bake a new cleanup clip onto the current actor.
5. Save Draft or Export JSON once the merged result is acceptable.

The merge output is baked into a normal cleanup clip so export, autosave, and clip recall continue to work without a second persistence format.
