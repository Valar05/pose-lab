# OneHandReady Projection Diagnostic

Generated: 2026-06-30T12:39:48.487Z
Clip: OneHandReady
Layers: projected-pins, fk, sword
First divergence layer: fk

## Top Findings
1. Worst FK joint position is LeftHand from Hand.L: avg 0.22811, max 0.22854.
2. Left arm FK position is worse than right: left avg 0.21012, right avg 0.1964.
3. Sword grip error is 0.25269 avg while blade tip error is 0.68407 avg, so tip/orientation divergence dominates attachment placement.
4. FK-only reconstruction is structurally close enough for silhouette analysis before IK/roll: avg 0.17422, max 0.22854.

## Metrics
- FK avg/max: 0.17422 / 0.22854
- Sword grip avg/max: 0.25269 / 0.25297
- Sword tip avg/max: 0.68407 / 0.69023
- Roll max abs: 0 deg

This artifact is diagnostic-only. It does not promote candidates or modify production retarget behavior.
