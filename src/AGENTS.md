# Pose Lab Source Notes

Use this when editing the standalone Pose Lab runtime instead of rereading the whole project orientation.

## File Ownership

- `pose-lab.js`: main lab runtime. Keep helper functions near the clip math section and keep panel-specific UI methods grouped inside `PoseLab`.
- `rig-profiles.js`: actor presets, clip lists, startup clips, and runtime-facing assumptions for each rig.
- `godot-rest-poses.js`: imported scene rest-pose data only.

## Orc Workflow Surfaces

- Orc source archives live in `../assets/source/orc_berserker/import_packs/`.
- Runtime candidate FBX clips live in `../assets/models/orc_berserker/imported/`.
- The Orc preset should expose new candidates through `extraClipUrls`; keep source provenance in `assets/asset_manifest.json`.
- Merge output should stay a baked cleanup clip, not a live procedural state. That keeps export/save behavior consistent with the existing cleanup tool.

## Validation

```sh
node --check src/pose-lab.js
python3 -m json.tool assets/asset_manifest.json >/dev/null
```
