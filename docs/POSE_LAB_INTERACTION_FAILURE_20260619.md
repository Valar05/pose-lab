# Pose Lab Interaction Failure

Observed after the startup/module failure was fixed. The app can render Ares, but it is still not usable for critique editing.

Actual state reported by user: selecting a pose/clip freezes the model, the newly selected clip does not keep playing, and bone controls do not visibly move any bones.

Current visual reference: `/storage/emulated/0/Pictures/Screenshots/Screenshot_20260619-100518.png` shows the app booted with Ares rendered and clip/pose controls visible, but it does not prove clip switching playback or bone edit motion.

Red tests added for this state:

- `tools/test_pose_lab_interaction_red_build_contract.mjs` requires fresh evidence that clip selection plays, animation continues after selection, and bone editing moves the rig.
- `tools/test_critique_clip_playback_contract.mjs` requires both UI clip selection and debug clip selection to explicitly leave critique playback live instead of frozen.

The build should remain red until a fresh capture/debug artifact proves those assertions.

## 2026-06-19 Fix

Runtime changes:

- Clip selection now calls `actor.pauseActive(false)`, switches critique transport back to `live`, refreshes the player/critique transport UI, and starts the selected clip from time zero.
- Debug clip selection now reports `activeClipChanged` and `paused: false` so the bridge can prove the selected clip is playing.
- Bone edits on an active animation no longer reset the bone to rest before applying the edit delta, so the edit layers over the current sampled clip pose instead of fighting playback.
- The entry page cache token was bumped to `pose-editor-22` so Android/browser cache cannot keep running the old frozen runtime.

Validation now passing:

- `node --check src/pose-lab.js`
- `node tools/test_pose_lab_startup_render_beacon.mjs`
- `node tools/test_critique_clip_playback_contract.mjs`
- `node tools/test_pose_lab_debug_bone_integration.mjs`
- `node tools/test_pose_lab_debug_bridge.mjs`
- `node tools/test_pose_lab_visual_red_build_contract.mjs`
- `node tools/test_pose_lab_interaction_red_build_contract.mjs`

Current evidence:

- `generated/visual_red_build/pose_lab_interaction_latest.json` records green deterministic behavior evidence for clip switching/playback and bone rotation state.
- `generated/visual_red_build/pose_lab_latest.json` is intentionally marked `visual-qa-blocked` because Android reports successful launch but no browser requests the local visual QA URL.
- The last successful screenshot/capture was for `pose-editor-15` and is now treated as stale after the `pose-editor-22` cache bump.

Remaining blocker:

Fresh Android visual capture is blocked outside the app runtime: the launcher returns success, but the browser never requests the local URL. Do not mark fresh visual evidence green until `../tools/visual_qa.mjs` produces a new `visual-qa-capture` for `pose-editor-22`.

## 2026-06-19 Hinge Drag Revision

The remaining bone movement failure had two layers. First, FK touch gestures stored `worldQuat` corrections while `applyPoseCorrection()` treated world-quaternion-only edits as empty; `poseEditHasMeaningfulValue()` now treats `worldQuat` as a real correction. Second, the visible interaction model was still wrong: dragging a selected foot/hand should move that bone toward the finger in screen space with a nearest-hinge IK solve, not rotate the bone by default. The current fix keeps the working Phalanx FK rotation math only for explicit twist mode and changes normal touch drag behavior:

- one-finger drag on a selected bone writes a global `pinned-parent-screen-target` hinge edit;
- two-finger pan anywhere uses the selected bone and writes the same pinned-parent hinge edit;
- the pinned hinge path keeps the selected bone parent fixed and rotates only that parent segment, so the knee stays pinned when dragging a foot;
- double tapping the selected bone toggles `hinge` and `twist`;
- only `twist` mode writes `worldQuat` FK rotation corrections using the old projected screen-plane pattern.


## 2026-06-19 Pinned Parent Hinge Revision

The new video showed parent-chain IK contamination: dragging `RightFoot` in `HINGE` moved the knee/upper chain. Default hinge drag now stores `mode: 'hinge'` with `axisMode: 'pinned-parent-screen-target'` and replays through a parent-only rotation. Existing saved `mode: 'ik'` corrections remain compatible, but new touch hinge edits do not call the two-bone IK solver.

Validation added:

- `node tools/test_touch_pose_pinned_hinge_drag.mjs`


## 2026-06-19 First Drag Targeting Revision

The newest screenshot showed the first drag selecting the opposite foot and displacing the model before later drags behaved correctly. First drag now uses a shared screen-distance target resolver: projected skeleton bones can beat farther IK controls, and correction overlay replay happens after selecting the intended bone so stale opposite-foot edits cannot steal the initial drag.

Validation added:

- `node tools/test_touch_pose_first_drag_targeting.mjs`

## 2026-06-19 Floating Dock And Persistence Revision

The pose editing surface now has a floating phone dock with Undo, Redo, Save, Reset, Cancel, Mode, Pose, and Clips controls. Pose correction undo/redo is stored separately in `localStorage` under `pose-lab:pose-history:v1`, bounded to 80 undo snapshots, and reset operations are undoable. Screen layout now persists the orbit view angle, critique transport mode, and Critique/Advanced Pose dock open state without restoring stale selected bones or active drags.

Pointer lifecycle was tightened so a new pointerdown cancels stale touch/multitouch edit state, while selection-only pointerups fall through to the regular picker. That removes the old release-and-retap tax after a drag without enabling selection changes during an active edit.

Validation added:

- `node tools/test_touch_pose_floating_dock.mjs`
- `node tools/test_pose_history_undo_redo.mjs`
- `node tools/test_pose_layout_persistence.mjs`

The entry page cache token was bumped to `pose-editor-22`.

## 2026-06-19 Two-Finger Camera And Dock Drag Revision

Two-finger bone editing is now disabled from the pointer input path so pinch/pan camera controls stay available. Adding a second touch cancels any active one-finger bone drag, clears tap-pick state, leaves orbit controls enabled, and does not capture pointers or write pose corrections. One-finger bone dragging and double-tap hinge/twist mode remain available.

The floating pose dock outer box is now transparent, has a `Move` drag handle, persists its dragged position with the screen layout state, and keeps Undo/Redo/Save/Reset/Cancel/Mode/Pose/Clips controls.

Validation updated:

- `node tools/test_touch_pose_two_finger_fk_rotation.mjs` now asserts two-finger camera preservation.
- `node tools/test_touch_pose_floating_dock.mjs` now asserts transparent draggable dock behavior.

The entry page cache token was bumped to `pose-editor-22`.

## 2026-06-19 Arbitrary Bone Undo Redo Regression

Added a sequence regression for arbitrary bone handle tweaks. The test builds a deliberately extreme pose with a world-quaternion twist, a pinned hinge foot translation, and explicit FK spine angles. It verifies the exact twist angle, translation offsets, and FK angles after each undo, redoes all edits, then performs a full clip reset and verifies every edited bone is cleared.

Validation added:

- `node tools/test_pose_history_arbitrary_bone_tweak_sequence.mjs`
