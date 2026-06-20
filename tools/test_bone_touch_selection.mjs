import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const css = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.css'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(js.includes('deselectBone()'), 'actor should expose deselectBone()');
assert(js.includes('clearBoneSelection('), 'lab should clear bone selection on empty viewport taps');
assert(js.includes('syncPoseEditorBoneSelection('), 'runtime should sync canvas-picked bones into the compact pose editor');
assert(js.includes('pickTouchPoseTarget(event, actor)'), 'bone picking should use a shared screen-distance touch target resolver');
assert(js.includes('isIkControlBoneName(name)'), 'runtime should distinguish visible IK controls from every IK-capable endpoint');
assert(js.includes('showTouchRigControls = false'), 'detached IK controls should be hidden in the base player view');
assert(js.includes('setTouchRigControlsVisible(visible)'), 'runtime should have an explicit IK control visibility gate');
assert(js.includes('!actor.showTouchRigControls'), 'hidden IK controls should not consume touch hits');
assert(js.includes('actor.setTouchRigControlsVisible(true);'), 'Correct Pose should enable detached IK controls');
assert(js.includes('actor.setBoneOverlayVisible(true);'), 'Correct Pose should make FK skeleton bones visibly selectable');
assert(js.includes('UI.playerPoseControls?.addEventListener'), 'transport Pose button should open detached IK controls without digging into Critique');
assert(js.includes('if (/toe|finger|thumb|index|middle|ring|pinky|hitbox|end/.test(value)) return false;'), 'IK controls should not be generated for toes, fingers, hitboxes, or end bones');
assert(js.includes('function isTouchPoseSelectableBoneName(name)'), 'touch pose picking should have a direct terminal-bone reject list');
assert(js.includes('object.visible && isTouchPoseSelectableBoneName(object.userData?.boneName)'), 'ray-picked FK handles should reject toe/finger/end bones');
assert(js.includes('!bone?.parent?.isBone || !isTouchPoseSelectableBoneName(bone.name)'), 'screen-space bone fallback should reject toe/finger/end bones');
assert(js.includes('!boneName || !isTouchPoseSelectableBoneName(boneName)'), 'touch drag should not start on terminal toe/finger/end bones');
assert(js.includes('opacity: 0.46,'), 'IK hit proxies should be visibly large translucent controls, not invisible ray targets');
assert(js.includes('control.material.opacity = selected ? 0.72 : 0.5;'), 'IK controls should remain visible and brighten when selected');
assert(js.includes("token === 'hand' || token === 'lefthand' || token === 'righthand' || token === 'foot' || token === 'leftfoot' || token === 'rightfoot'"), 'IK controls should be limited to canonical hand and foot bones');
assert(js.includes('new THREE.LineLoop'), 'IK controls should use sparse Blender-style outline shapes');
assert(js.includes("rigifyControl = isFoot ? 'foot-square' : 'hand-circle'"), 'IK controls should identify Blender-style hand circle and foot square shapes');
assert(!js.includes('new THREE.TorusGeometry'), 'hand IK controls should not use bulky filled torus shapes');
assert(js.includes('const handleHits = control ? [] : this.pickBoneHandleHits(event, actor);'), 'bone picking should still fall back to selectable skeleton objects when no IK control wins');
assert(js.includes("const mode = kind === 'ik' && endpoint ? 'ik' : 'fk';"), 'only detached canonical IK controls should enter IK mode; skeleton-picked bones stay FK');
assert(js.includes("const dragKind = target.kind === 'ik' ? 'ik' : 'fk';"), 'target resolver should preserve IK selection for close controls and FK selection for screen bones');
assert(js.includes('bonePickObjects(actor)'), 'bone picking should collect all selectable bone overlay objects');
assert(js.includes('...actor.boneLines.values()'), 'bone picking should include visible bone line segments, not just tiny handles');
assert(js.includes('this.raycaster.params.Line.threshold'), 'bone line picking should widen the mobile touch hit target');
const labBody = js.split('class PoseLab')[1] || '';
const selectBoneMethod = [...labBody.matchAll(/  selectBone\(name[^)]*\) \{[\s\S]*?\n  \}/g)].pop()?.[0] || '';
assert(selectBoneMethod.includes('this.showTouchPoseHud('), 'canvas bone selection should open the tiny touch pose HUD');

const selectBoneFn = [...labBody.matchAll(/  selectBone\(name, kind = '', editMode = ''\) \{[\s\S]*?\n  \}/g)].pop()?.[0] || '';
assert(selectBoneFn.includes('this.selectedTouchControl ='), 'selection should update selected control state');
assert(selectBoneFn.includes('this.showTouchPoseHud('), 'selection should update HUD');
assert(!selectBoneFn.includes('actor.seek('), 'selecting FK or IK controls must not seek/reset the clip pose');
assert(!selectBoneFn.includes('mixer.setTime'), 'selecting FK or IK controls must not resample animation time');
assert(!selectBoneFn.includes('currentPoseCorrectionKey(true)'), 'selection must not create correction keys');
assert(!selectBoneFn.includes('applyPoseCorrectionOverlay'), 'selection must not apply correction overlays');
assert(!selectBoneFn.includes('poseOverlayEnabled ='), 'selection must not toggle correction overlays');

const beginDragFn = js.match(/  beginTouchPoseDrag\(event\) \{[\s\S]*?\n  \}/)?.[0] || '';
assert(beginDragFn.includes('actor.pauseActive(true);'), 'touch gesture should freeze playback before selection so the pose cannot advance under the finger');
assert(beginDragFn.includes('actor.seek(actor.activeAction?.time || 0);'), 'touch gesture should resample the visible frame before selection');
assert(beginDragFn.includes('this.applyPoseCorrectionOverlay(actor);'), 'touch gesture should restore visible corrections after selecting the intended bone');
assert(beginDragFn.indexOf('this.selectBone(boneName, selectKind,') < beginDragFn.indexOf('this.applyPoseCorrectionOverlay(actor);'), 'touch selection should happen before replaying corrections so stale opposite-foot edits cannot win first drag');
assert(beginDragFn.includes('this.selectBone(boneName, selectKind,'), 'touch gesture should select the target control and preserve hinge/twist mode before considering edits');
assert(beginDragFn.includes('editing: false'), 'touch pointerdown should start as selection-only, not an active edit');
assert(!beginDragFn.includes('touchEditForControl(control, true)'), 'touch pointerdown must not create correction keys or reset pose state');
const startEditDragFn = js.match(/  startTouchPoseEditDrag\(\) \{[\s\S]*?\n  \}/)?.[0] || '';
assert(startEditDragFn.includes("if (this.touchPoseDrag.control.kind !== 'ik' && this.touchPoseDrag.control.kind !== 'fk') return null;"), 'touch drag edits should be limited to FK bones and IK controls');
assert(startEditDragFn.includes('this.touchEditForControl(this.touchPoseDrag.control, true)'), 'correction key creation should be isolated to drag activation');
assert(startEditDragFn.includes('this.touchPoseDrag.editing = true;'), 'drag activation should mark the gesture as editing');
const updateDragFn = js.match(/  updateTouchPoseDrag\(event\) \{[\s\S]*?\n  \}/)?.[0] || '';
assert(updateDragFn.includes('TOUCH_POSE_DRAG_THRESHOLD'), 'touch editing should require crossing a drag threshold');
assert(updateDragFn.includes('this.startTouchPoseEditDrag()'), 'touch editing should create correction state only after threshold crossing');
assert(updateDragFn.includes('this.startTouchPoseEditDrag()'), 'FK and IK touch editing should create correction state only after threshold crossing');
const finishDragFn = js.match(/  finishTouchPoseDrag\(event\) \{[\s\S]*?\n  \}/)?.[0] || '';
assert(finishDragFn.includes('this.cancelTouchPoseDrag(event, true);'), 'finishing a touch gesture should route through central cleanup');
assert(finishDragFn.includes('return wasEditing;'), 'finished selection-only taps should fall through to immediate pickBoneHandle reselect');

assert(!selectBoneMethod.includes('UI.poseEditDock.open = true'), 'canvas bone selection should not open the large numeric pose dock');
assert(js.includes('if (!target) {'), 'empty bone-pick hits should be handled explicitly after shared target resolution');
assert(js.includes("this.clearBoneSelection('deselected bone');"), 'empty tap should deselect the active FK bone');
const clearBoneSelection = js.match(/  clearBoneSelection\(statusText = 'deselected bone'\) \{[\s\S]*?\n  \}/)?.[0] || '';
assert(!clearBoneSelection.includes('setTouchRigControlsVisible(false)'), 'deselecting FK bones should not hide the separate large IK controls');
assert(!js.includes("this.setPanel('bones');"), 'canvas bone selection should not route to the hidden legacy Bones panel');

assert(js.includes('pickNearestScreenBone(event, actor)'), 'bone selection should support screen-space bone picking');
assert(js.includes('distanceToScreenSegment('), 'screen-space bone picking should measure distance to projected bone segments');
assert(js.includes(`if (!actor) return;
    const target = this.pickTouchPoseTarget(event, actor);`), 'bone picking should not return before attempting selection when overlay is hidden');
assert(!js.includes(`if (!actor?.showBoneOverlay) return;
    const hits = this.pickBoneHandleHits(event, actor);`), 'tap selection should not require the overlay to already be visible');
const openCorrectPoseFn = js.match(/  openCorrectPose\(\) \{[\s\S]*?\n  \}/)?.[0] || '';
assert(openCorrectPoseFn.includes('actor.setBoneOverlayVisible(true);'), 'Pose button should reveal FK skeleton lines and handles');
assert(openCorrectPoseFn.includes('actor.setTouchRigControlsVisible(true);'), 'Pose button should reveal separate large IK controls');
assert(openCorrectPoseFn.includes('this.showTouchPoseHud({'), 'Pose button should show an explanatory HUD before selection');
assert(js.includes('showDebugHelpers = false'), 'watch-bone debug markers should be hidden in the critique player by default');
assert(js.includes('marker.visible = this.showDebugHelpers'), 'watch-bone markers should obey the debug visibility gate');
assert(js.includes('line.visible = this.showDebugHelpers'), 'watch-bone drop lines should obey the debug visibility gate');
assert(html.includes('id="playerPoseControls"'), 'phone transport should expose a visible Pose button');
assert(css.includes('body.phone-controls.critique-mode.pose-correction-active #playerPoseControls'), 'Pose button should visibly latch when correction controls are active');
assert(css.includes('body.phone-controls.critique-mode #touchPoseHud.active'), 'touch pose HUD should activate without a large dock');
assert(css.includes('body.phone-controls.critique-mode #poseEditDock:not([open])'), 'pose editor visibility should follow the details open attribute');
assert(!css.includes('body.phone-controls.critique-mode #poseEditDock:not(.open)'), 'pose editor should not depend on a class that details never receives');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['touch-select-bone', 'touch-away-deselect', 'pose-editor-sync'] }, null, 2));
