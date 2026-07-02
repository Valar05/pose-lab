# Standalone Pose Lab Agent Notes

Read `PROJECT_ORIENTATION.md` before edits.

Before any Meshy saber/FK work, read `docs/POSE_LAB_AGENT_FAILURE_CONTRACT.md`. The current Meshy saber state is not accepted as fixed; future work must start from "Meshy must be FPS weapon FK plus authored offsets, nothing else."

For Orc import or merge work, then read `docs/ORC_IMPORT_AND_MERGE_WORKFLOW.md` and `src/AGENTS.md` instead of searching the whole lab blindly.

Keep this lab source-focused: inspect assets, record provenance, and keep runtime assumptions in `src/rig-profiles.js`. When importing new source assets, preserve originals under `assets/source/`, place runtime-ready GLB/FBX files under `assets/models/`, and update `assets/asset_manifest.json`.

Validate with:

```sh
node --check src/pose-lab.js
python3 -m json.tool assets/asset_manifest.json >/dev/null
```

Do not remove the Gravity Fist-derived bone/retarget panels unless replacing them with an equal or better standalone workflow.

Any manual fix authored by the user is the golden standard. Never overwrite manual animation, pose, socket, camera, UI, material, asset, runtime, or weapon/model attachment fixes from diagnostics, generated candidates, semantic-landmark output, socket-solver output, tests, cleanup scripts, or retarget metrics unless the user explicitly asks to replace that exact fix and confirms the replacement separately.
