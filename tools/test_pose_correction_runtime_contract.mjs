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

const reset = methodBody('resetPoseCorrectionBase()');
const overlay = methodBody('applyPoseCorrectionOverlay(actor = this.actors.get(this.selected))');
const begin = methodBody('beginTouchPoseDrag(event)');
const update = methodBody('updateTouchPoseDrag(event)');
const apply = methodBody('applyTouchPoseDelta(event)');

assert(reset, 'resetPoseCorrectionBase should exist');
assert(!reset.includes('mixer.setTime'), 'pose correction reset must not drive mixer-global time');
assert(reset.includes('this.activeAction.time = clampValue(this.activeAction.time || 0, 0, duration);'), 'pose correction reset should preserve action-local time');
assert(reset.includes('this.mixer.update(0);'), 'pose correction reset should resample without advancing playback');
assert(overlay.indexOf('actor.resetPoseCorrectionBase();') >= 0, 'overlay should resample the base pose');
assert(overlay.indexOf('actor.resetPoseCorrectionBase();') < overlay.indexOf('actor.applyPoseCorrection(correction);'), 'overlay must resample before IK/FK edits');
assert(begin.includes('actor.pauseActive(true);'), 'pose touch should pause playback before editing');
assert(begin.includes('actor.seek(actor.activeAction?.time || 0);'), 'pose touch should freeze the current visible action frame');
assert(begin.includes('this.applyPoseCorrectionOverlay(actor);'), 'pose touch should restore visible corrections after freeze');
assert(begin.indexOf('this.selectBone(boneName, selectKind,') < begin.indexOf('this.applyPoseCorrectionOverlay(actor);'), 'bone selection should happen before correction replay so first drag uses the intended target');
assert(begin.includes('editing: false'), 'pointerdown should remain selection-only');
assert(!begin.includes('touchEditForControl(control, true)'), 'pointerdown must not create correction edits');
assert(update.includes('TOUCH_POSE_DRAG_THRESHOLD'), 'drag must cross threshold before edit creation');
assert(apply.includes("if (control.kind === 'fk' && control.editMode === 'twist')"), 'FK screen-plane rotation should be reserved for explicit twist mode');
assert(apply.includes('const hinge = this.hingeTargetDelta(event);'), 'default touch deltas should move a screen-space hinge pinned hinge target');
assert(apply.includes('if (!this.touchPoseDrag?.editing || !this.touchPoseDrag.startEdit) return null;'), 'delta application must be impossible before edit activation');
const correctionApply = methodBody('applyPoseCorrection(correction = {})');
assert(correctionApply.includes('if (!isTouchPoseSelectableBoneName(name)) continue;'), 'persisted terminal-bone corrections should be ignored instead of reapplying bad toe/end edits');
assert(js.includes('function isTouchPoseSelectableBoneName(name)') && js.includes('if (/toe|finger|thumb|index|middle|ring|pinky|hitbox|end/.test(value)) return false;'), 'terminal bones should be blocked from touch pose selection and correction playback');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-correction-runtime-contract', 'no-cumulative-ik-spin', 'selection-preserves-correction'] }, null, 2));
