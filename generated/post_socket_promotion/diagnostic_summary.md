# Post Socket Promotion Diagnostic

Generated: 2026-06-30T15:39:06.794Z

## Promotion Gate
- Candidate promotable: true
- Solver max deviation: 0.0051
- Solver predicted picked grip error avg/max: 0.00325 / 0.0051
- Changed production field: Meshy Character weaponProxy.modelLocalOffset
- Candidate value: [0.21119,-0.07415,0.23297]

## Metrics
- Average picked grip error: 0.53876 -> 0.00325 (-0.53551)
- Average tip error: 0.50953 -> 0.48979 (-0.01974)
- Average blade direction error: 36.918 -> 36.918 deg (0)
- Post-promotion dominant class: orientation/basis
- Projection sword tip avg/max: 0.68407 / 0.69023

## Visual Read
- The saber grip now follows the projected arm/socket in a retarget-friendly way: placement error is below 0.01 across the authored keys.
- The remaining blocker is blade direction/orientation: grip placement is solved, but blade direction error remains high and tip error remains much larger than grip error.
- Do not tune further in this pass; next work should isolate attachment/basis or socket rotation evidence without changing FK, roll, or arm motion.
