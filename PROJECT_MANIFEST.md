# Project Manifest: pose-lab

- Generated: 2026-06-20T17:00:50-05:00
- Workspace path: `/storage/emulated/0/Documents/GodotProjects/pose-lab`
- Git repository: yes
- Git remote: `https://github.com/Valar05/pose-lab.git`
- Orientation: `PROJECT_ORIENTATION.md`
- Agent instructions: `AGENTS.md`

## Purpose Snapshot
> # Standalone Pose Lab Orientation
> This is a standalone browser Pose Lab seeded from the newer `gravity-fist-threejs` pose lab. It is for inspecting imported GLB/Blend animation assets before they become runtime actors.
> ## Entry Points
> - `pose-lab.html`: browser lab UI.
> - `pose-lab.html`: critique-first entry by default; use `?mode=standard` for the fuller lab chrome.
> - `pose-critique.html`: explicit critique alias that opens the same lab with the 3D viewport as the priority surface.
> - `tools/call_codex_critique.py`: Codex-backed critique runner that consumes a poseclip packet and writes prompt/run artifacts under `generated/codex_critiques/`.
> - `src/pose-lab.js`: Gravity Fist-derived lab runtime with clip, bone, transform, and retarget panels.
> - `src/rig-profiles.js`: local FPSPlayer profile used by the lab.
> - `assets/models/FPSPlayer.glb`: runtime GLB exported from `FPSPlayer.blend`.
> - `assets/source/FPSPlayer.blend`: copied source blend for provenance.
> - `assets/models/arcane/Forgeborn.glb`: Arcane Manifold full-body player rig copied from THECAULDRON.
> - `assets/models/arcane/Animation_*.fbx`: Arcane Manifold native leg/turn animation clips loaded onto the full rig.
> - `assets/source/arcane/Player.tscn`: Arcane Manifold scene reference for active player model and AnimationPlayer wiring.
> - `assets/asset_manifest.json`: asset source and processing notes.

## Entrypoints And Validation Clues
- No standard entrypoint was detected. Inspect top-level files and add project-specific validation commands when known.

## Top-Level Inventory
- `.gitattributes`
- `.gitignore`
- `AGENTS.md`
- `assets/`
- `docs/`
- `generated/`
- `index.html`
- `pose-critique.html`
- `pose-lab.html`
- `PROJECT_ORIENTATION.md`
- `src/`
- `tools/`
- `vendor/`

## Git Hygiene
- `.gitignore` contains a Codex workspace hygiene block for credentials, caches, and local build outputs.
- `.gitattributes` contains a Codex Git LFS block for common binary assets, models, audio, video, archives, fonts, and PDFs.
- `git lfs install --local` was attempted for this repository during the manifest pass.

