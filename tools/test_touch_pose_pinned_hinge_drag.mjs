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

function functionBody(name) {
  const marker = `function ${name}(`;
  const start = js.indexOf(marker);
  if (start < 0) return '';
  const brace = js.indexOf('{', start);
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

const pinnedTarget = functionBody('pinnedHingeTarget');
const applyPinned = methodBody('applyPosePinnedHingeEdit(name, edit = {})');
const applyIk = methodBody('applyPoseIkEdit(name, edit = {})');
const applyCorrection = methodBody('applyPoseCorrection(correction = {})');
const hingeMeta = methodBody('hingeEditMetadata(control = this.selectedTouchControl)');
const applyOne = methodBody('applyTouchPoseDelta(event)');

assert(pinnedTarget.includes('const restVector = endpointWorld.clone().sub(anchorWorld);'), 'pinned hinge target should measure the original anchor-to-endpoint segment');
assert(pinnedTarget.includes('const length = restVector.length();'), 'pinned hinge target should preserve segment length');
assert(pinnedTarget.includes('targetVector.normalize().multiplyScalar(length)'), 'pinned hinge target should clamp the dragged target to the segment length');

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length() { return Math.sqrt(this.lengthSq()); }
  normalize() { const len = this.length(); if (len > 0) this.multiplyScalar(1 / len); return this; }
  distanceTo(v) { return this.clone().sub(v).length(); }
}

const pinnedHingeTargetFn = Function(`return (${pinnedTarget});`)();
const anchor = new Vec3(0, 0, 0);
const endpoint = new Vec3(0, -2, 0);
const draggedTarget = new Vec3(1, 2, 0);
const clamped = pinnedHingeTargetFn(anchor, endpoint, draggedTarget);
assert(Math.abs(clamped.distanceTo(anchor) - endpoint.distanceTo(anchor)) < 0.000001, 'pinned hinge target should keep the selected segment length constant');
assert(anchor.x === 0 && anchor.y === 0 && anchor.z === 0, 'pinned hinge target math should not mutate the anchor vector');
assert(clamped.y > endpoint.y, 'upward drag should move the endpoint target upward around the pinned parent');

assert(applyPinned.includes('const endpoint = this.boneByName.get(name);'), 'pinned hinge apply should use the selected bone as the held endpoint');
assert(applyPinned.includes('const driver = endpoint?.parent?.isBone ? endpoint.parent : null;'), 'pinned hinge apply should use the selected bone parent as the pinned hinge/driver');
assert(applyPinned.includes('const anchorWorld = worldPositionOf(driver);'), 'pinned hinge apply should capture the parent anchor world position');
assert(applyPinned.includes('const endpointWorld = worldPositionOf(endpoint);'), 'pinned hinge apply should capture the held endpoint world position');
assert(applyPinned.includes('const targetWorld = endpointWorld.clone().add(this.poseOffsetVector(edit, endpoint));'), 'pinned hinge apply should convert stored screen-space offset into a world target');
assert(applyPinned.includes('const clampedTarget = pinnedHingeTarget(anchorWorld, endpointWorld, targetWorld);'), 'pinned hinge apply should clamp target relative to the pinned parent');
assert(applyPinned.includes('rotateIkJointToward(driver, endpoint, clampedTarget, 1);'), 'pinned hinge apply should rotate only the selected bone parent segment');
assert(!applyPinned.includes('solveTwoBoneIk'), 'pinned hinge apply must not call the two-bone solver that moves parent-chain bones');
assert(!applyPinned.includes('chain.upper'), 'pinned hinge apply must not rotate the grandparent/upper bone');

assert(applyIk.includes('solveTwoBoneIk(this.model, chain.upper, chain.lower, chain.endpoint, target, 7);'), 'legacy IK apply should remain available for saved IK corrections');
assert(applyCorrection.includes("if (edit.mode === 'hinge') this.applyPosePinnedHingeEdit(name, edit);"), 'pose correction playback should route hinge mode to pinned-parent solver first');
assert(applyCorrection.includes("else if (edit.mode === 'ik') this.applyPoseIkEdit(name, edit);"), 'pose correction playback should keep legacy IK mode compatible');

assert(hingeMeta.includes('const endpoint = actor?.boneByName?.get(control?.boneName || \'\');'), 'hinge metadata should look up the selected endpoint bone');
assert(hingeMeta.includes('const driver = endpoint?.parent?.isBone ? endpoint.parent : null;'), 'hinge metadata should record the pinned parent bone');
assert(hingeMeta.includes('anchorBoneName: driver?.name || \'\''), 'hinge metadata should persist the parent anchor name for diagnostics');
assert(hingeMeta.includes('drivenBoneName: endpoint?.name || control?.boneName || \'\''), 'hinge metadata should persist the driven endpoint name for diagnostics');

assert(applyOne.includes('Object.assign(next, this.hingeEditMetadata(control));'), 'one-finger hinge drag should persist pinned hinge metadata');
assert(applyOne.includes("next.mode = 'hinge';"), 'one-finger hinge drag should write hinge mode, not IK mode');
assert(applyOne.includes("next.axisMode = 'pinned-parent-screen-target';"), 'one-finger hinge drag should label pinned-parent screen target mode');
assert(!applyOne.includes("next.mode = 'ik';"), 'one-finger default hinge drag must not write generic IK mode');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pinned-parent-hinge-apply', 'no-two-bone-ik-for-hinge', 'hinge-touch-persistence'] }, null, 2));
