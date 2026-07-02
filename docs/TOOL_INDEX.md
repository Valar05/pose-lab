# Pose Lab Tool Index

Use this index to choose the smallest proof surface before editing.

## Case And Evidence Front Doors

### `node tools/pose_lab_case.mjs list`

- Status: current
- Proves: lists active named cases and their ownership families.
- Does not prove: does not run any visual verifier.

### `node tools/pose_lab_case.mjs verify --case <id>`

- Status: current
- Proves: writes route, artifact status, checks, and verdict for one named case.
- Does not prove: does not run heavy render/capture checks unless the case marks them default or `--run-checks` is used.

### `node tools/pose_lab_doctor.mjs --json`

- Status: current
- Proves: summarizes workflow health, case verdicts, stale visual evidence, manifest status, and server status.
- Does not prove: does not fix red cases.

## Weapon FK And Meshy Sword

### `node tools/pose_lab_offline_render.mjs --assert-fixed`

- Status: current
- Proves: offline Meshy pose/weapon render can satisfy hilt pinning, hilt displacement, and blade-basis checks.
- Does not prove: live browser capture is fresh.

### `node tools/test_weapon_fk_attachment_contract.mjs`

- Status: current
- Proves: weapon FK attachment contract wiring is protected.
- Does not prove: live browser screenshot correctness.

### `node tools/test_manual_weapon_placement_lock.mjs`

- Status: current
- Proves: manual weapon placement cannot be overwritten by diagnostics or promotion logic.
- Does not prove: current visual evidence freshness.

## Meshy/FPS Retarget And Roll Contracts

### `node tools/pose_lab_workflow_status.mjs`

- Status: current
- Proves: accepted baseline and promotion gate status.
- Does not prove: visual acceptance of a candidate.

### `node tools/test_meshy_fps_ready_relation_audit.mjs`

- Status: current
- Proves: ready relation audit logic is valid.
- Does not prove: promotion evidence.

### `node tools/meshy_ready_pose_workbench.mjs`

- Status: current
- Proves: candidate-only FPS reference artifacts can be produced.
- Does not prove: those candidates are accepted.

## Visual Truth, Red Builds, And Cache

### `node tools/test_pose_lab_visual_red_build_contract.mjs`

- Status: current
- Proves: current offline pose-render evidence matches served cache token and required accepted Meshy saber evidence.
- Does not prove: fresh evidence creation.

### `node tools/test_no_cache_server_contract.mjs`

- Status: current
- Proves: no-cache server contract is wired.
- Does not prove: browser tab actor/clip state.

### `node tools/refresh_pose_lab_offline_visual_evidence.mjs`

- Status: current
- Proves: rebuilds the canonical Meshy saber offline visual evidence artifact.
- Does not prove: source code is correct without the contract checks.

### `node tools/pose_lab_weapon_visual_follow.mjs`

- Status: deprecated for Meshy saber acceptance
- Proves: diagnostic debug-bridge weapon follow evidence when bridge and browser are healthy.
- Does not prove: accepted Meshy saber visual truth.

### `node tools/refresh_meshy_saber_visual_parity.mjs --skip-visual-follow`

- Status: deprecated for Meshy saber acceptance
- Proves: legacy offline/live divergence classification.
- Does not prove: accepted Meshy saber visual truth.

## Generated Artifact Hygiene

### `node tools/catalog_generated_artifacts.mjs --out generated/artifact_manifest.json`

- Status: current
- Proves: generated tree classification into keep/review/delete.
- Does not prove: image content usefulness.

### `node tools/review_generated_artifact_manifest.mjs`

- Status: current
- Proves: mining summary, recurring problem families, and no-delete review log.
- Does not prove: deletion unless `--delete-marked` is supplied.

## Pose Critique And Attack Iteration

### `python3 tools/render_poseclip_stickframes.py`

- Status: current
- Proves: stickframe visual packet can be rendered for pose critique.
- Does not prove: live Three.js runtime correctness.

### `python3 tools/measure_poseclip_world_metrics.py`

- Status: current
- Proves: world-metric pose analysis can run for poseclip data.
- Does not prove: visual appeal.

## Legacy Or Specialized Diagnostics

### `tools/*workspace*.mjs`, `tools/*audit*.mjs`, `tools/*debug*.mjs`

- Status: legacy-use-through-case
- Proves: specific historical diagnostic surfaces remain available.
- Does not prove: first-line acceptance unless routed by a case.
