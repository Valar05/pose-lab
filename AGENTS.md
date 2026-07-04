# Standalone Pose Lab Agent Notes

Read `PROJECT_ORIENTATION.md`, `docs/POSE_LAB_AGENT_REVIEW_PROCESS.md`, and `docs/POSE_LAB_HUMAN_MEASURABLE_TEST_DOCTRINE.md` before edits.

Before any Meshy saber/FK work, read `docs/POSE_LAB_AGENT_FAILURE_CONTRACT.md`. The current Meshy saber state is not accepted as fixed; future work must start from "Meshy must be FPS weapon FK plus authored offsets, nothing else."

For visual/FK/weapon tests, classify every changed test as acceptance, diagnostic, guardrail, or quarantine. Machine contracts, source strings, markers, metrics, and offline artifacts cannot become acceptance unless they are paired with the current human-visible evidence lane.

If the user reports red cloud screenshots, no-op visual change, manual Meshy Character loading, or a wrong hand/hilt/blade relationship, run `node tools/pose_lab_visual_truth_preflight.mjs` and fix the lying cloud UI/evidence gate before any FK, offset, hand-rotation, or pose-math edit. Browser wake and route banners are not visual acceptance.

If preflight reports `AUTHORITY_REVOKED_FALSE_GREEN`, agent authority to claim green is revoked. Do not wake the browser, do not promote, and do not edit FK/offset/pose surfaces until the human red-build ledger entry is superseded by accepted human-visible evidence.

For Orc import or merge work, then read `docs/ORC_IMPORT_AND_MERGE_WORKFLOW.md` and `src/AGENTS.md` instead of searching the whole lab blindly.

Keep this lab source-focused: inspect assets, record provenance, and keep runtime assumptions in `src/rig-profiles.js`. When importing new source assets, preserve originals under `assets/source/`, place runtime-ready GLB/FBX files under `assets/models/`, and update `assets/asset_manifest.json`.

Validate with:

```sh
node --check src/pose-lab.js
python3 -m json.tool assets/asset_manifest.json >/dev/null
```

Do not remove the Gravity Fist-derived bone/retarget panels unless replacing them with an equal or better standalone workflow.

Any manual fix authored by the user is the golden standard. Never overwrite manual animation, pose, socket, camera, UI, material, asset, runtime, or weapon/model attachment fixes from diagnostics, generated candidates, semantic-landmark output, socket-solver output, tests, cleanup scripts, or retarget metrics unless the user explicitly asks to replace that exact fix and confirms the replacement separately.
