# Pose Lab Visual Authority Ladder

Use this ladder before changing Meshy saber, pose retargeting, or visual proof code. The purpose is to stop false-green loops by separating authoring, reproduction, diagnostics, and presentation.

## Authority Order

1. **Blender authoring truth**
   - A human-approved Blender viewport is the authoring source for Meshy saber placement and Ready hold.
   - The Blender export contract lives under `authoring/meshy_saber/exports/` after explicit approval.
   - Pose Lab must not retarget, solve, tune, or reinterpret the approved Blender weapon hold while importing it.

2. **Pose Lab import truth**
   - Pose Lab proves it can reproduce the approved Blender hierarchy and transforms.
   - The required hierarchy is `RightHand -> WeaponGrip -> sabre mesh`.
   - T-pose is the canary: if it changes unintentionally, the import is red.

3. **Diagnostics and guardrails**
   - Source strings, matrix metrics, socket traces, route checks, generated candidates, and offline renderers explain failures.
   - They cannot accept a visual fix unless paired with the relevant authoring or presentation evidence.

4. **Cloud presentation truth**
   - Firebase hosted visual truth is the final browser presentation gate after authoring/import truth exists.
   - It verifies that the hosted page shows the approved result; it is not the place to discover or tune the pose.

5. **User screenshot veto**
   - A current user screenshot can veto any green claim.
   - If a screenshot is red while diagnostics are green, classify the diagnostics as false-green or incomplete.

## Stop Rules

- If two visual edits produce no visible change, stop editing runtime/offsets and repair the evidence path or quarantine the branch.
- Do not wake a browser for a stale URL, 404, docs page, route-only page, or red artifact.
- Do not commit visual-success wording until the evidence type matches the failure type.
- Do not overwrite manual or Blender-approved values from diagnostics unless the user explicitly asks to replace that exact value.

