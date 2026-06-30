# Blade Vector Workspace Diagnostic

Generated: 2026-06-30T16:09:24.411Z
Clip: OneHandReady
Dominant failure class: attachment-placement
Recommendation: Align the actual attachment hilt/grip landmark or offset before blade-basis or scale fixes.

## Aggregate Metrics
- Average socket error: 0.53876
- Average picked grip error: 0.53876
- Average hilt landmark error: 0.53876
- Average blade direction error: 38.485 deg
- Average blade length ratio: 1.55155
- Average tip error: 0.48679

## Classification Counts
- attachment-placement: 31

## Interpretation
1. Average socket error is 0.53876; this keeps WeaponGrip/socket alignment separate from rendered grip landmark alignment.
2. Average picked grip error is 0.53876; placement classification uses this rendered attachment grip landmark metric.
3. Average hilt landmark error is 0.53876; hilt placement is outside the small-error threshold 0.08.
4. Average blade direction error is 38.485 deg; this exceeds the large-direction threshold 12 deg.
5. Average blade length ratio is 1.55155; length is meaningfully mismatched by the 0.08 ratio threshold.
6. Dominant class is attachment-placement, so the single next production fix is: Align the actual attachment hilt/grip landmark or offset before blade-basis or scale fixes.

This is diagnostic-only. It does not modify FK, roll, production retarget behavior, startup clips, aliases, accepted baselines, or production retarget settings.
