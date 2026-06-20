# Pose Lab Startup Failure

Observed in `Screenshot_20260619-093505.png` at 2026-06-19 09:35 local time.

Actual state: Pose Critique loads far enough to show the header and controls frame, but the startup path stops on the browser banner `module failed: Invalid or unexpected token` before the expected lab UI renders.

Impact: the startup render beacon never reaches the normal ready state, so the page is visually red even though the shell chrome appears.

Regression check: `tools/test_pose_lab_visual_red_build_contract.mjs` should stay red while this evidence file points at the failing capture.

Next step: inspect the imported browser module graph and the vendor dependency that is throwing the parse/load failure.
