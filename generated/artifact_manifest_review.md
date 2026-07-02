# Generated Artifact Manifest Review

- Source manifest: `generated/artifact_manifest.json`
- Image inspection: not-performed
- Keep entries justified: 34 (4.7 MB)
- Review/mixed entries retained for later review: 122 (195.5 MB)
- Delete entries selected: 0 (0 B)
- Delete execution this run: not requested
- Last actual deletion summary: 103 deleted; 0 missing; 0 skipped; 0 errors
- Mining index: `generated/artifact_mining_index.json`

## Mining Summary

Method: metadata-only: path names, retention reasons, schemas, representative file names, file/image counts; no image decoding or visual judgment.

### Weapon Pinning / FK Attachment

Evidence about sabre hilt placement, hand-relative pinning, WeaponGrip/WeaponR behavior, and whether the weapon follows pose animation like FPS arms.

- Entries: 30
- Size: 12.4 MB
- Files: 116
- Images: 52
- Main retention reasons:
  - 24x image-heavy or critique evidence requires a later visual review before deletion
  - 5x canonical diagnostic, workflow, baseline, or latest evidence root
  - 1x named diagnostic run may document a specific regression stage
- Frequent schemas:
  - 16x `pose-lab-live-weapon-visual-follow-v1`
  - 3x `pose-lab-offline-weapon-visual-repro-v1`
  - 2x `pose-lab-meshy-blade-vector-workspace-v1`
  - 1x `pose-lab-post-grip-tip-landmark-audit-v1`
- Representative paths:
  - `generated/blade_vector_workspace`
  - `generated/post_grip_baseline`
  - `generated/semantic_landmark_calibration`
  - `generated/socket_solver`
  - `generated/test_runs/offline-tpose-hilt-pin-176`
  - `generated/weapon_basis_workspace`
  - `generated/weapon_visual_follow`
  - `generated/weapon_visual_follow/applied-hilt-marker-20260701`

### Meshy/FPS Retarget And Roll Offsets

Evidence about mapping FPS Arms clips onto Meshy, rest/ready/tpose deltas, roll corrections, projected pins, and visual IK variants.

- Entries: 77
- Size: 173.9 MB
- Files: 619
- Images: 415
- Main retention reasons:
  - 57x image-heavy or critique evidence requires a later visual review before deletion
  - 11x canonical diagnostic, workflow, baseline, or latest evidence root
  - 5x named diagnostic run may document a specific regression stage
  - 2x contains images; usefulness requires later visual inspection
- Frequent schemas:
  - 15x `pose-lab-weapon-retarget-stick-debug-v1`
  - 7x `pose-lab-offline-pose-weapon-render-v1`
  - 7x `pose-lab-live-weapon-visual-follow-v1`
  - 3x `pose-lab-core-transform-audit-v1`
- Representative paths:
  - `generated/blade_vector_workspace`
  - `generated/bone_orientation_inspector`
  - `generated/bone_orientation_inspector/onehand_ready`
  - `generated/core_transform_audit`
  - `generated/core_transform_audit/meshy_swing1`
  - `generated/core_transform_audit/meshy_swing1_latest`
  - `generated/fpv_camera_audit`
  - `generated/post_grip_baseline`

### Visual Truth / Capture Parity

Evidence about Android/browser/offline visual disagreement, red builds, stale captures, visual QA, and renderer parity.

- Entries: 38
- Size: 157.4 MB
- Files: 519
- Images: 413
- Main retention reasons:
  - 30x image-heavy or critique evidence requires a later visual review before deletion
  - 5x canonical diagnostic, workflow, baseline, or latest evidence root
  - 2x named diagnostic run may document a specific regression stage
  - 1x mixed container with keep/review/delete child runs; do not delete the whole directory from this marker
- Frequent schemas:
  - 5x `pose-lab-offline-pose-weapon-render-v1`
  - 2x `pose-lab-critique-packet-build-v1`
  - 2x `pose-lab-stickframe-render-v1`
  - 2x `pose-lab-meshy-onehand-ready-visual-parity-v1`
- Representative paths:
  - `generated/pose_lab_offline_render`
  - `generated/pose_lab_offline_render/latest`
  - `generated/pose_renders`
  - `generated/pose_renders/cache_check`
  - `generated/test_runs`
  - `generated/test_runs/offline-assert-fixed-ready`
  - `generated/test_runs/offline-assert-fixed-red`
  - `generated/visual_parity`

### Manual Pose / Attack Iteration

Evidence from authored pose renders, critique packets, attack metrics, and manual render families used to judge pose quality.

- Entries: 38
- Size: 10.8 MB
- Files: 708
- Images: 576
- Main retention reasons:
  - 32x image-heavy or critique evidence requires a later visual review before deletion
  - 6x structured pose/attack metrics with project-specific schema
- Frequent schemas:
  - 32x `pose-lab-stickframe-render-v1`
  - 5x `pose-lab-world-metrics-v1`
  - 5x `pose-lab-critique-packet-build-v1`
  - 2x `pose-lab-sf2-local-score-v1`
- Representative paths:
  - `generated/axekick_after_carry_metrics.json`
  - `generated/axekick_finished_fix_metrics.json`
  - `generated/axekick_finished_metrics.json`
  - `generated/axekick_metrics_fix_target.json`
  - `generated/axekick_metrics_latest.json`
  - `generated/critique_packets`
  - `generated/critique_packets/ares_axekick_finished_strike`
  - `generated/critique_packets/ares_axekick_sf2_current`

### Workflow Hygiene / Generated Churn

Evidence about repeated process-id outputs, manifests, cleanup logs, server logs, methods notes, and artifacts that indicate workflow friction.

- Entries: 130
- Size: 193.8 MB
- Files: 1370
- Images: 1010
- Main retention reasons:
  - 106x image-heavy or critique evidence requires a later visual review before deletion
  - 8x named diagnostic run may document a specific regression stage
  - 5x generated artifact cleanup audit trail
  - 4x canonical diagnostic, workflow, baseline, or latest evidence root
- Frequent schemas:
  - 32x `pose-lab-stickframe-render-v1`
  - 16x `pose-lab-live-weapon-visual-follow-v1`
  - 15x `pose-lab-weapon-retarget-stick-debug-v1`
  - 10x `pose-lab-offline-pose-weapon-render-v1`
- Representative paths:
  - `generated/artifact_deletion_log.json`
  - `generated/artifact_deletion_plan.json`
  - `generated/artifact_manifest.json`
  - `generated/artifact_manifest_review.md`
  - `generated/artifact_mining_index.json`
  - `generated/artifact_review_log.json`
  - `generated/cases`
  - `generated/cases/generated-churn`

### Bone Orientation / Basis Diagnostics

Evidence about hand/arm bone orientation, basis transforms, blade vectors, landmark overlays, and local/world transform audits.

- Entries: 17
- Size: 13.1 MB
- Files: 79
- Images: 23
- Main retention reasons:
  - 9x canonical diagnostic, workflow, baseline, or latest evidence root
  - 5x image-heavy or critique evidence requires a later visual review before deletion
  - 3x contains images; usefulness requires later visual inspection
- Frequent schemas:
  - 3x `pose-lab-bone-orientation-inspector-v1`
  - 3x `pose-lab-core-transform-audit-v1`
  - 2x `pose-lab-meshy-blade-vector-workspace-v1`
  - 1x `pose-lab-meshy-fps-ready-relation-audit-v1`
- Representative paths:
  - `generated/blade_vector_workspace`
  - `generated/bone_orientation_inspector`
  - `generated/bone_orientation_inspector/debug_check`
  - `generated/bone_orientation_inspector/onehand_ready`
  - `generated/core_transform_audit`
  - `generated/core_transform_audit/meshy_swing1`
  - `generated/core_transform_audit/meshy_swing1_latest`
  - `generated/fpv_camera_audit`

## Recurring Problems Mined

### Weapon attachment has repeatedly diverged between stored socket data, bone hierarchy, runtime visual layer, and offline verification.

- Evidence families: `weapon_pinning_and_fk`, `bone_orientation_and_basis`, `visual_truth_and_capture`
- Implication: A fix is not trustworthy unless it proves the same hand-local hilt offset and blade basis in browser/runtime and offline renderer artifacts.

### Visual evidence has fragmented across screenshots, browser state, debug bridge output, and offline renderers.

- Evidence families: `visual_truth_and_capture`, `workflow_hygiene_and_generated_churn`
- Implication: Reports should name the exact route, actor, clip, cache token, renderer, and artifact path before declaring visual success.

### Meshy/FPS retarget work has mixed rest-pose deltas, ready-pose deltas, roll offsets, visual IK, projected pins, and manual offsets.

- Evidence families: `meshy_fps_retarget`, `bone_orientation_and_basis`
- Implication: Future mining should separate target-minus-tpose calibration, clip-specific offsets, and user-authored manual fixes as different contracts.

### Generated evidence churn hides which artifacts are canonical versus scratch, especially when tests emit process-id folders.

- Evidence families: `workflow_hygiene_and_generated_churn`
- Implication: Tools should write stable latest/baseline paths by default and reserve process-id outputs for temporary debug runs.

### Pose-quality iteration produces useful visual history, but image-heavy folders require explicit visual review before retention decisions.

- Evidence families: `manual_pose_and_attack_iteration`
- Implication: Cleanup must not delete critique/manual render families until a visual contact-sheet review labels the useful baselines.

## Next Mining Passes

- visual-baseline contact sheet review: label which image-heavy artifacts are canonical baselines, failed attempts, or disposable duplicates
- weapon FK contract map: trace each hilt/socket/basis artifact to the source code path or rig-profile field it validates
- generated-output normalization: move recurring tools toward stable latest/baseline outputs and fewer process-id scratch folders

## Keep Justification

Keep entries are retained because they are current manifests, structured metrics with project schemas, named baselines, or canonical diagnostic roots used to compare pose/weapon/rendering regressions.

### canonical diagnostic, workflow, baseline, or latest evidence root

- Count: 20
- Size: 4.2 MB
- Files: 61
- Images: 13
- Representative paths:
  - `generated/blade_vector_workspace`
  - `generated/cases`
  - `generated/cases/generated-churn`
  - `generated/cases/visual-truth-parity`
  - `generated/core_transform_audit`
  - `generated/core_transform_audit/meshy_swing1`
  - `generated/core_transform_audit/meshy_swing1_latest`
  - `generated/fpv_camera_audit`
  - `generated/metric_landmark_audit`
  - `generated/pose_lab_offline_render`
  - `generated/pose_lab_offline_render/latest`
  - `generated/post_grip_baseline`

### current generated artifact manifest

- Count: 1
- Size: 111.2 KB
- Files: 1
- Representative paths:
  - `generated/artifact_manifest.json`

### generated artifact cleanup audit trail

- Count: 5
- Size: 35.6 KB
- Files: 5
- Representative paths:
  - `generated/artifact_deletion_log.json`
  - `generated/artifact_deletion_plan.json`
  - `generated/artifact_manifest_review.md`
  - `generated/artifact_mining_index.json`
  - `generated/artifact_review_log.json`

### named baseline artifact used for comparison

- Count: 1
- Size: 110.8 KB
- Files: 5
- Images: 2
- Representative paths:
  - `generated/test_runs/tpose-baseline-before-fix`

### structured pose/attack metrics with project-specific schema

- Count: 7
- Size: 202.3 KB
- Files: 7
- Representative paths:
  - `generated/axekick_after_carry_metrics.json`
  - `generated/axekick_finished_fix_metrics.json`
  - `generated/axekick_finished_metrics.json`
  - `generated/axekick_metrics_fix_target.json`
  - `generated/axekick_metrics_latest.json`
  - `generated/last_attack_batch.json`
  - `generated/pose_indexes_smash_regen_latest.json`

## Review / Mixed

Review entries are not deleted. They are image-heavy, mixed containers, named diagnostic stages, or unclassified metadata where usefulness cannot be proven without later artifact review.

### contains images; usefulness requires later visual inspection

- Count: 3
- Size: 2.0 MB
- Files: 8
- Images: 4
- Representative paths:
  - `generated/bone_orientation_inspector`
  - `generated/bone_orientation_inspector/debug_check`
  - `generated/bone_orientation_inspector/onehand_ready`

### image-heavy or critique evidence requires a later visual review before deletion

- Count: 106
- Size: 187.4 MB
- Files: 1253
- Images: 974
- Representative paths:
  - `generated/critique_packets`
  - `generated/critique_packets/ares_axekick_finished_strike`
  - `generated/critique_packets/ares_axekick_sf2_current`
  - `generated/manual_renders`
  - `generated/manual_renders/ares_axekick_composited`
  - `generated/manual_renders/ares_axekick_contactfix`
  - `generated/manual_renders/ares_axekick_contactfix2`
  - `generated/manual_renders/ares_axekick_finished_strike_xy`
  - `generated/manual_renders/ares_axekick_finished_strike_xz`
  - `generated/manual_renders/ares_axekick_groundcontact_xy`
  - `generated/manual_renders/ares_axekick_groundcontact_xz`
  - `generated/manual_renders/ares_axekick_postfix`

### mixed container with keep/review/delete child runs; do not delete the whole directory from this marker

- Count: 1
- Size: 1.5 MB
- Files: 45
- Images: 18
- Representative paths:
  - `generated/test_runs`

### named diagnostic run may document a specific regression stage

- Count: 8
- Size: 1.4 MB
- Files: 40
- Images: 16
- Representative paths:
  - `generated/test_runs/baseline-fix-probe`
  - `generated/test_runs/offline-assert-fixed-ready`
  - `generated/test_runs/offline-assert-fixed-red`
  - `generated/test_runs/offline-tpose-displacement-180`
  - `generated/test_runs/offline-tpose-displacement-180b`
  - `generated/test_runs/offline-tpose-fk-sword-178`
  - `generated/test_runs/offline-tpose-forward-179`
  - `generated/test_runs/offline-tpose-hilt-pin-176`

### unclassified generated metadata; review before deletion

- Count: 4
- Size: 3.3 MB
- Files: 8
- Representative paths:
  - `generated/pose_lab_methods.json`
  - `generated/pose_overwrites`
  - `generated/pose_overwrites/backups`
  - `generated/server_logs`

## Delete

Delete entries are empty files, one-off browser probes, or repeated process-id/contract scratch runs that can be regenerated from checked-in tools.

## Safety Checks

- Planned deletable entries: 0
- Planned skipped entries: 0
- Refused deletion for any path outside `generated/`, the `generated` root itself, or a delete-marked ancestor containing keep/review children.
