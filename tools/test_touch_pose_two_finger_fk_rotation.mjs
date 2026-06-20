import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function methodBody(name) {
  const marker = `  ${name} {`;
  const start = js.indexOf(marker);
  if (start < 0) return '';
  const brace = start + marker.length - 1;
  let depth = 0;
  for (let i = brace; i < js.length; i += 1) {
    if (js[i] === '{') depth += 1;
    if (js[i] === '}') {
      depth -= 1;
      if (depth === 0) return js.slice(start, i + 1);
    }
  }
  return '';
}

const down = methodBody('handleTouchPosePointerDown(event)');
const move = methodBody('handleTouchPosePointerMove(event)');
const up = methodBody('handleTouchPosePointerUp(event)');
const allow = methodBody('allowCameraMultiTouch(event = null)');
const beginOne = methodBody('beginTouchPoseDrag(event)');
const applyOne = methodBody('applyTouchPoseDelta(event)');
const startOne = methodBody('startTouchPoseEditDrag()');
const cancelAll = methodBody('cancelAllTouchPoseGestures(event = null, renderIfEdited = false)');

assert(js.includes('this.activeTouchPointers = new Map();'), 'runtime should still track active touch pointers');
assert(js.includes('this.multiTouchPoseGesture = null;'), 'runtime should keep stale gesture cleanup state available');
assert(down.includes('this.trackTouchPointer(event);'), 'pointerdown should track touch points before routing');
assert(down.includes('if (this.activeTouchPointers.size >= 2) return this.allowCameraMultiTouch(event);'), 'second touch should preserve camera controls instead of entering bone mode');
assert(!down.includes('this.beginMultiTouchPoseGesture(event)'), 'pointerdown must not start two-finger bone pose editing');
assert(move.includes('this.updateTrackedTouchPointer(event);'), 'pointermove should keep touch tracking current');
assert(move.includes('if (this.activeTouchPointers.size >= 2) {\n      this.allowCameraMultiTouch(event);'), 'two-finger move should keep camera controls enabled');
assert(!move.includes('this.applyMultiTouchPoseDelta(event);'), 'pointermove must not apply two-finger bone edits');
assert(up.includes("event?.pointerType === 'touch' && this.activeTouchPointers.size > 0 && !this.touchPoseDrag"), 'lifting one of two camera touches should not select a bone');
assert(allow.includes('this.cancelTouchPoseDrag(event, false);'), 'two-finger camera gesture should cancel an active one-finger bone drag');
assert(allow.includes('this.pointerDown = null;'), 'two-finger camera gesture should clear tap picking state');
assert(allow.includes('this.controls.enabled = true;'), 'two-finger camera gesture should explicitly preserve orbit controls');
assert(allow.includes('return false;'), 'two-finger camera gesture should not consume the browser/camera event path');
assert(beginOne.includes('if (this.activeTouchPointers.size >= 2) return false;'), 'one-finger drag starter should refuse to run while two touches are active');

assert(beginOne.includes('const isDoubleTap = this.isTouchPoseDoubleTap(boneName, event);'), 'one-finger bone touch should still detect double taps');
assert(beginOne.includes('this.toggleSelectedTouchEditMode();'), 'double tap should still toggle hinge/twist without beginning a drag');
assert(startOne.includes("this.touchPoseDrag.control.kind === 'fk' && this.touchPoseDrag.control.editMode === 'twist' && !this.touchPoseDrag.fk"), 'screen-angle FK context should remain mandatory only for one-finger twist mode');
assert(applyOne.includes("if (control.kind === 'fk' && control.editMode === 'twist')"), 'one-finger FK worldQuat rotation should remain gated behind twist mode');
assert(applyOne.includes('const fkDelta = this.screenPlaneFkDelta(event);'), 'twist mode should keep the old working one-finger FK screen-plane rotation pattern');
assert(applyOne.includes('const hinge = this.hingeTargetDelta(event);'), 'default one-finger drag should still compute pinned hinge target deltas');
assert(cancelAll.includes('this.activeTouchPointers.clear();'), 'global cancellation should clear tracked touches');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['two-finger-camera-preserved', 'one-finger-bone-drag-still-active', 'double-tap-twist-still-available'] }, null, 2));
