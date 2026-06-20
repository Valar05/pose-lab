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

const begin = methodBody('beginTouchPoseDrag(event)');
const start = methodBody('startTouchPoseEditDrag()');
const hingeDelta = methodBody('hingeTargetDelta(event, drag = this.touchPoseDrag)');
const fkContext = methodBody('screenPlaneFkContext(actor, boneName, event)');
const fkDelta = methodBody('screenPlaneFkDelta(event)');
const apply = methodBody('applyTouchPoseDelta(event)');
const fkApply = methodBody('applyPoseFkEdit(name, edit = {})');
const ikApply = methodBody('applyPoseIkEdit(name, edit = {})');
const chain = methodBody('ikChainForEndpoint(name)');

assert(begin.includes("const dragKind = target.kind === 'ik' ? 'ik' : 'fk';"), 'touch drag should use the shared target resolver kind');
assert(begin.includes('fk: this.screenPlaneFkContext(actor, boneName, event)'), 'pointerdown should still cache old FK screen-plane context for explicit twist mode');
assert(begin.includes("this.selectedTouchControl?.editMode : 'hinge'"), 'new bone drags should default to hinge mode');
assert(start.includes("if (this.touchPoseDrag.control.kind !== 'ik' && this.touchPoseDrag.control.kind !== 'fk') return null;"), 'touch edit activation should allow FK and IK controls only');
assert(start.includes("this.touchPoseDrag.control.kind === 'fk' && this.touchPoseDrag.control.editMode === 'twist' && !this.touchPoseDrag.fk"), 'FK screen-plane context should be required only when explicit twist mode needs it');

assert(hingeDelta.includes('const dx = event.clientX - drag.startX;') && hingeDelta.includes('const dy = event.clientY - drag.startY;'), 'hinge target drag should derive movement from finger delta');
assert(hingeDelta.includes('this.screenPlaneWorldDelta(dx, dy)'), 'hinge target drag should project movement onto the camera plane');
assert(hingeDelta.includes('Number(drag.startEdit.x || 0) + world.x * 100'), 'hinge target drag should preserve existing X offset and add visual delta');
assert(hingeDelta.includes('Number(drag.startEdit.y || 0) + world.y * 100'), 'hinge target drag should preserve existing Y offset and add visual delta');
assert(hingeDelta.includes('Number(drag.startEdit.z || 0) + world.z * 100'), 'hinge target drag should preserve existing Z offset and add visual delta');

assert(fkContext.includes('originWorld') && fkContext.includes('endWorld'), 'twist context should record bone origin and endpoint in world space');
assert(fkContext.includes('originScreen') && fkContext.includes('endScreen'), 'twist context should record projected origin and endpoint');
assert(fkContext.includes('radius') && fkContext.includes('TOUCH_POSE_FK_MIN_RADIUS'), 'twist context should guard tiny projected bone radii');
assert(fkDelta.includes('Math.atan2(current.y, current.x) - Math.atan2(start.y, start.x)'), 'twist should compute signed screen angle around projected origin');
assert(fkDelta.includes('fk.axisInfo?.axisWorld'), 'twist should use inferred anatomical axis, not camera-forward roll');
assert(fkDelta.includes('new THREE.Quaternion().setFromAxisAngle(axisWorld, angle)'), 'twist should produce a world quaternion from inferred axis plus screen angle');

assert(apply.includes("if (control.kind === 'fk' && control.editMode === 'twist')"), 'FK screen-plane rotation should be reserved for explicit twist mode');
assert(apply.includes('this.screenPlaneFkDelta(event)'), 'twist mode should use projected origin angle math');
assert(apply.includes("next.axisMode = 'selected-bone-twist';"), 'twist correction should store an explicit twist axis mode');
assert(apply.includes('next.axisWorld = fkDelta.axisWorld;'), 'twist correction should store inferred axis world vector');
assert(apply.includes('next.angle = fkDelta.angle;'), 'twist correction should store signed screen angle');
assert(apply.includes('next.worldQuat = fkDelta.worldQuat.toArray();'), 'twist correction should store world quaternion');
assert(apply.includes('const hinge = this.hingeTargetDelta(event);'), 'default FK/IK touch drag should use hinge target delta, not FK rotation');
assert(apply.includes('Object.assign(next, this.hingeEditMetadata(control));'), 'default FK/IK touch drag should persist pinned parent metadata');
assert(apply.includes('next.mode = \'hinge\';'), 'default FK/IK touch drag should write pinned hinge target edits');
assert(apply.includes("next.axisMode = 'pinned-parent-screen-target';"), 'default FK/IK touch drag should label pinned-parent hinge target edits');
assert(apply.includes('next.worldQuat = null;'), 'default FK/IK touch drag should clear worldQuat instead of rotating the bone');
assert(!apply.includes('next.rotY = Number(startEdit.rotY || 0) + dx'), 'touch drag must not map dx to local rotY');
assert(!apply.includes('next.rotX = Number(startEdit.rotX || 0) + dy'), 'touch drag must not map dy to local rotX');

assert(chain.includes('const endpoint = this.boneByName.get(name);'), 'IK chain should solve relative to the selected bone endpoint');
assert(chain.includes('const lower = endpoint.parent;') && chain.includes('const upper = lower.parent;'), 'IK chain should use the selected bone nearest hinge chain');
assert(ikApply.includes('solveTwoBoneIk(this.model, chain.upper, chain.lower, chain.endpoint, target, 7);'), 'IK apply should solve the selected bone toward the projected target while preserving child FK');
assert(fkApply.includes('edit.worldQuat'), 'FK apply should still understand explicit twist world-quaternion corrections');
assert(fkApply.includes('setBoneWorldQuaternion(bone, worldQuat)'), 'FK world quaternion should be applied through world-space bone setter');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pinned-hinge-target-default', 'twist-screen-plane-rotation', 'legacy-ik-compatible-pinned-hinge-default'] }, null, 2));
