# OneHandReady Projection Diagnostic

Generated: 2026-06-30T12:39:35.448Z
Clip: OneHandReady
Layers: projected-pins, fk, basis, roll
First divergence layer: fk

## Top Findings
1. Worst FK joint position is LeftHand from Hand.L: avg 0.22811, max 0.22854.
2. Left arm FK position is worse than right: left avg 0.21012, right avg 0.1964.
3. Worst roll divergence is RightHand: avg abs 122.658 deg, max abs 122.713 deg.
4. FK-only reconstruction is structurally close enough for silhouette analysis before IK/roll: avg 0.17422, max 0.22854.
5. Roll remains dangerous: max abs roll error 122.713 deg can visually destroy a pose even when joint positions are close.

## Metrics
- FK avg/max: 0.17422 / 0.22854
- Sword grip avg/max: 0 / 0
- Sword tip avg/max: 0 / 0
- Roll max abs: 122.713 deg

This artifact is diagnostic-only. It does not promote candidates or modify production retarget behavior.
