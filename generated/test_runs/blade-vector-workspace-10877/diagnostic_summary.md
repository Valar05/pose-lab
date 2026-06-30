# Blade Vector Workspace Diagnostic

Generated: 2026-06-30T14:06:09.617Z
Clip: OneHandReady
Dominant failure class: attachment-placement
Recommendation: Revisit hilt/socket placement before blade-basis or scale fixes.

## Aggregate Metrics
- Average hilt error: 0.53876
- Average blade direction error: 44.029 deg
- Average blade length ratio: 1.58131
- Average tip error: 0.60558

## Classification Counts
- attachment-placement: 31

## Interpretation
1. Average hilt error is 0.53876; hilt placement is outside the small-error threshold 0.08.
2. Average blade direction error is 44.029 deg; this exceeds the large-direction threshold 12 deg.
3. Average blade length ratio is 1.58131; length is meaningfully mismatched by the 0.08 ratio threshold.
4. Dominant class is attachment-placement, so the single next production fix is: Revisit hilt/socket placement before blade-basis or scale fixes.

This is diagnostic-only. It does not modify FK, roll, production retarget behavior, startup clips, aliases, accepted baselines, or production retarget settings.
