# OneHandReady Projection Diagnostic

Generated: 2026-06-30T14:07:56.088Z
Clip: OneHandReady
Layers: projected-pins, fk, ik, sword, basis, roll
First divergence layer: fk

## Top Findings
1. Worst FK joint position is LeftHand from Hand.L: avg 0.22811, max 0.22854.
2. Left arm FK position is worse than right: left avg 0.21012, right avg 0.1964.
3. Worst roll divergence is RightHand: avg abs 82.47 deg, max abs 82.798 deg.
4. Sword grip error is 0.089 avg while blade tip error is 0.67092 avg, so tip/orientation divergence dominates attachment placement.
5. FK-only reconstruction is structurally close enough for silhouette analysis before IK/roll: avg 0.17422, max 0.22854.
6. Roll remains dangerous: max abs roll error 82.798 deg can visually destroy a pose even when joint positions are close.

## Metrics
- FK avg/max: 0.17422 / 0.22854
- Sword grip avg/max: 0.089 / 0.08901
- Sword tip avg/max: 0.67092 / 0.67955
- Roll max abs: 82.798 deg

This artifact is diagnostic-only. It does not promote candidates or modify production retarget behavior.
