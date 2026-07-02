# Pose Lab Core Surface

This directory is the future home for pure pose, rig, clip, weapon, and transform rules shared by browser and offline tools.

During migration, shared runtime rules still live in `src/`:

- `src/pose-runtime-rules.mjs`
- `src/weapon-runtime-rules.mjs`
- `src/meshy-ready-runtime.mjs`
- `src/startup-policy.mjs`

New implementation should prefer pure modules that can be imported by both browser and offline verification.
