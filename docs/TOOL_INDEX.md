# Pose Lab Tool Index

Use this index to choose the smallest proof surface before editing.

## Case And Evidence Front Doors

### `node tools/pose_lab_current_truth.mjs --json`

- Status: mandatory front door before visual/FK/weapon work.
- Proves: current branch, commit, cache token, preflight status, open red-build strikes, current evidence path, allowed work, and blocked work.
- Does not prove: visual correctness or human acceptance.

### `docs/POSE_LAB_AGENT_REVIEW_PROCESS.md`

- Status: mandatory for red-build and Meshy saber work.
- Proves: the required order before visual claims, browser wake, promotion, FK edits, offset edits, pose edits, or evidence-gate work.
- Does not prove: visual correctness by itself.

### `docs/POSE_LAB_HUMAN_MEASURABLE_TEST_DOCTRINE.md`

- Status: mandatory for visual/FK/weapon test changes.
- Proves: the required distinction between acceptance, diagnostic, guardrail, and quarantine tests.
- Does not prove: any current screenshot is visually accepted.

### `docs/POSE_LAB_LAGOON_ROADMAP.md`

- Status: design direction.
- Proves: the intended recovery path toward calm review, safe authoring modes, disposable candidates, and protected goldens.
- Does not prove: current implementation completeness.

### `node tools/test_pose_lab_visual_test_role_audit.mjs`

- Status: mandatory for visual/FK/weapon/pose test changes.
- Proves: high-risk visual/FK/weapon/pose tests are classified in `contracts/visual_test_roles.json`.
- Does not prove: classified tests are correct or sufficient; it prevents unclassified machine contracts from quietly becoming acceptance.

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
- Proves: diagnostic offline Meshy pose/weapon render can satisfy hilt pinning, hilt displacement, and blade-basis checks.
- Does not prove: Meshy saber acceptance, live browser freshness, or human-visible cloud truth.

### `node tools/test_weapon_fk_attachment_contract.mjs`

- Status: current
- Proves: diagnostic/guardrail weapon FK attachment wiring is protected.
- Does not prove: Meshy saber visual acceptance.

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

### `node tools/pose_lab_cloud_visual_truth_self_service.mjs --commit-message "..." --push --wait --download --inspect`

- Status: current front door for hosted Meshy visual truth.
- Proves: runs local preflight, commits tracked edits, pushes, waits for the PR Firebase workflow, downloads the artifact, inspects required PNGs, and wakes the exact Ready capture URL only when the artifact is green/ready for review.
- Does not prove: human visual acceptance by itself; the printed `tpose.png`, `ready.png`, and `ready_visual_follow.png` still must be inspected.

### `node tools/pose_lab_visual_truth_preflight.mjs`

- Status: current hard stop before wake or Meshy FK edits after a red build.
- Proves: the current artifact is commit/cache/build-current, not human-red, cold-loads Meshy without manual actor selection, and has accepted T-pose plus Ready visible relationship checks. `AUTHORITY_REVOKED_FALSE_GREEN` means generated proof has lost authority and only evidence-gate repair/quarantine work is allowed.
- Does not prove: the user has accepted the visual result; it only blocks known false-green paths before handoff.

### `node tools/test_pose_lab_visual_red_build_contract.mjs`

- Status: current
- Proves: red-build and false-green guardrails remain wired.
- Does not prove: fresh evidence creation or Meshy saber acceptance.

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
