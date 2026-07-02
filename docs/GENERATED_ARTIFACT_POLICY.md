# Generated Artifact Policy

Generated artifacts are evidence, not app code. Keep them useful by attaching them to a case, a baseline, or a review queue.

## Stable Locations

- `generated/cases/<case-id>/latest/`: current case verdict, route, and summary.
- `generated/workflow_state/`: accepted workflow baselines.
- `generated/pose_lab_offline_render/latest/`: canonical offline pose/weapon render.
- `generated/artifact_manifest.json`: generated tree inventory.
- `generated/artifact_mining_index.json`: mined problem families and next mining passes.

## Retention Rules

- Keep: current manifests, accepted baselines, case evidence, canonical diagnostic roots, and structured metrics with project schemas.
- Review: image-heavy evidence, critique packets, visual QA output, and named diagnostic stages.
- Delete: empty files, one-off browser probes, process-id scratch runs, and contract rerun output that can be regenerated.

## Process-ID Output

Process-id folders under `generated/test_runs/` are disposable unless one of these is true:

- the folder is named in a case;
- the folder is a named baseline;
- the folder documents a specific regression stage with a stable non-PID label.

## Cleanup Workflow

```sh
node tools/catalog_generated_artifacts.mjs --out generated/artifact_manifest.json
node tools/review_generated_artifact_manifest.mjs
node tools/review_generated_artifact_manifest.mjs --dry-run --delete-marked
```

Only run `--delete-marked` after reviewing the dry-run summary. Do not delete `review` entries without a separate visual review pass.
