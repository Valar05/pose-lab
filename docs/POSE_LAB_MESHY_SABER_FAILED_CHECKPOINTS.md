# Meshy Saber Failed Checkpoints

This file preserves failed Meshy saber/FK checkpoints as evidence. A checkpoint listed here is not accepted production truth, even if some repo tests or offline artifacts were green at the time.

## 2026-07-02 - a544003 visible-hilt/blade-axis calibration

Commit: `a544003458f1f8a27be46911d53bad77a290e8f7`  
Branch: `codex/meshy-weapon-fps-parity`  
User verdict: red build, no-op churn.

### What The Checkpoint Changed

- Calibrated Meshy saber attachment literals in `src/rig-profiles.js` and `src/meshy-ready-runtime.mjs`.
- Changed `tools/pose_lab_offline_render.mjs` to prefer the runtime visible mesh hilt and gate Ready visible blade-axis error.
- Bumped browser cache token to `pose-editor-189`.
- Updated literal-lock tests and `generated/visual_red_build/pose_lab_latest.json`.

### Why It Is Quarantined

The repo/runtime/offline gates passed, but the user's live visual review reported no useful visual change. That means the green offline evidence did not represent the served/browser visual truth the user saw. Treat this as an offline-runtime parity failure, not a placement-success checkpoint.

Do not use the `a544003` attachment values, cache token bump, or green offline artifact as proof that Meshy saber placement is fixed. They may be mined only as failed evidence.

### Salvaged Evidence

- The existing offline visual contract can still be fooled by a mismatch between what it renders and what the user sees in the browser.
- Hilt-to-`WeaponGrip` pinning and visible-blade axis comparison are necessary but not sufficient.
- The next useful test must prove offline/web truth parity for the exact served build, actor, clip, attachment source, and visual layer before any new offset or rotation edit.

### Required Next Move

Before another Meshy saber visual edit:

1. Prove the served browser runtime and offline renderer consume the same Meshy attachment source and cache-tokened modules.
2. Prove the same clip/actor route is selected in offline and browser truth.
3. Prove the browser-visible saber hilt/tip/axis can be extracted or mirrored into an artifact comparable to the offline render.
4. Only after parity is red in the same way as the user screenshot should another FK/attachment change be attempted.

This follows `docs/POSE_LAB_AGENT_FAILURE_CONTRACT.md`: two visual no-ops stop implementation and force evidence-path repair.
