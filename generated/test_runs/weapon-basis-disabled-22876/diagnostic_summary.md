# Weapon Basis Workspace Diagnostic

Generated: 2026-06-30T12:55:47.355Z
Clip: OneHandReady
Dominant cause: something-unexpected: target-grip-mismatch-plus-attachment-basis

## Top Findings
1. Relative to FPS-projected Weapon.R, current real attachment hilt differs by 0.46993 avg; this is a target-landmark mismatch, not automatically a bad Meshy hand grip.
2. Socket-relative saber basis is still wrong: current blade axis error is 46.659 deg avg and socket-relative tip error is 0.6199 avg.
3. Attachment-rotation-only experiment drops blade axis error to 0 deg and socket-relative tip error to 0.31254 avg, isolating basis/rotation as the dominant local weapon issue.
4. Tip-landmark-only experiment drops blade axis error to 0 deg but leaves FPS-projected tip error at 0.46993 avg because the socket target is still offset.
5. Position-only experiment proves socket placement alone is insufficient: blade axis stays 46.659 deg avg and tip error stays 0.6199 avg.
6. Scale-only experiment leaves blade axis error at 46.659 deg avg, so attachment scale is secondary.

## Current Profile Metrics
- Grip position avg/max: 0.46993 / 0.46996
- Blade axis avg/max: 46.659 / 47.947 deg
- Blade tip avg/max: 0.58127 / 0.58634
- Socket-relative tip avg/max: 0.6199 / 0.63195
- Hilt avg/max: 0.46993 / 0.46996

This is diagnostic-only. It does not modify FK, roll, production retarget behavior, startup clips, aliases, or accepted baselines.
