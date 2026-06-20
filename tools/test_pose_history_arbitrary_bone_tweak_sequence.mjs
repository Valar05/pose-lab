import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function approx(actual, expected, epsilon, message) {
  if (Math.abs(actual - expected) > epsilon) failures.push(`${message}: expected ${expected}, got ${actual}`);
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

function clonePoseCorrections(corrections) {
  const copy = JSON.parse(JSON.stringify(corrections || {})) || {};
  return { schema: 'pose-lab-pose-corrections-v1', entries: copy.entries && typeof copy.entries === 'object' ? copy.entries : {} };
}

function axisAngleQuat(axis, degrees) {
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  const [x, y, z] = axis.map((value) => value / len);
  const radians = degrees * Math.PI / 180;
  const half = radians / 2;
  const s = Math.sin(half);
  return [x * s, y * s, z * s, Math.cos(half)];
}

function quatAngleDegrees(quat) {
  if (!Array.isArray(quat) || quat.length !== 4) return 0;
  const len = Math.hypot(quat[0], quat[1], quat[2], quat[3]);
  const w = Math.max(-1, Math.min(1, Math.abs(quat[3] / (len || 1))));
  return 2 * Math.acos(w) * 180 / Math.PI;
}

function editFor(corrections, boneName) {
  const entry = corrections.entries['ares::axe-kick'] || null;
  const key = entry?.keys?.['42'] || null;
  return key?.edits?.[boneName] || null;
}

function editCount(corrections) {
  return Object.values(corrections.entries || {}).reduce((sum, entry) => sum + Object.values(entry.keys || {}).reduce((keySum, key) => keySum + Object.keys(key.edits || {}).length, 0), 0);
}

class PoseHistoryHarness {
  constructor() {
    this.poseCorrections = { schema: 'pose-lab-pose-corrections-v1', entries: {} };
    this.poseHistory = { schema: 'pose-lab-pose-history-v1', undo: [], redo: [] };
  }
  snapshot(label) {
    return { schema: 'pose-lab-pose-history-snapshot-v1', label, poseCorrections: clonePoseCorrections(this.poseCorrections) };
  }
  push(label) {
    this.poseHistory.undo.push(this.snapshot(label));
    this.poseHistory.redo = [];
  }
  restore(snapshot) {
    this.poseCorrections = clonePoseCorrections(snapshot.poseCorrections);
  }
  undo() {
    const snapshot = this.poseHistory.undo.pop();
    if (!snapshot) return false;
    this.poseHistory.redo.push(this.snapshot('redo pose edit'));
    this.restore(snapshot);
    return true;
  }
  redo() {
    const snapshot = this.poseHistory.redo.pop();
    if (!snapshot) return false;
    this.poseHistory.undo.push(this.snapshot('undo pose edit'));
    this.restore(snapshot);
    return true;
  }
  ensureKey() {
    const entryKey = 'ares::axe-kick';
    if (!this.poseCorrections.entries[entryKey]) {
      this.poseCorrections.entries[entryKey] = {
        schema: 'pose-lab-pose-correction-entry-v1',
        actorKey: 'ares',
        clipKey: 'axe-kick',
        clipName: 'Ares Axe Kick',
        keys: {},
      };
    }
    const entry = this.poseCorrections.entries[entryKey];
    if (!entry.keys['42']) entry.keys['42'] = { schema: 'pose-lab-pose-correction-key-v1', frame: 42, time: 1.4, edits: {} };
    return entry.keys['42'];
  }
  mutate(label, boneName, edit) {
    this.push(label);
    this.ensureKey().edits[boneName] = { ...edit };
  }
  resetClip() {
    this.push('reset clip edits');
    delete this.poseCorrections.entries['ares::axe-kick'];
  }
}

function assertLeftForearmTwist(corrections, expectedDegrees) {
  const edit = editFor(corrections, 'mixamorig:LeftForeArm');
  assert(edit?.mode === 'fk', 'left forearm twist edit should exist in FK mode');
  assert(edit?.gestureKind === 'twist', 'left forearm edit should remain labeled twist');
  approx(quatAngleDegrees(edit?.worldQuat), expectedDegrees, 0.000001, 'left forearm twist worldQuat angle');
  approx(Number(edit?.rotX || 0), 0, 0.000001, 'left forearm twist rotX should stay zero when worldQuat drives twist');
  approx(Number(edit?.rotY || 0), 0, 0.000001, 'left forearm twist rotY should stay zero when worldQuat drives twist');
  approx(Number(edit?.rotZ || 0), 0, 0.000001, 'left forearm twist rotZ should stay zero when worldQuat drives twist');
}

function assertRightFootTranslate(corrections, expected) {
  const edit = editFor(corrections, 'mixamorig:RightFoot');
  assert(edit?.mode === 'hinge', 'right foot translate edit should exist in hinge mode');
  assert(edit?.axisMode === 'pinned-parent-screen-target', 'right foot translate should preserve pinned hinge axisMode');
  approx(Number(edit?.x || 0), expected.x, 0.000001, 'right foot translate x');
  approx(Number(edit?.y || 0), expected.y, 0.000001, 'right foot translate y');
  approx(Number(edit?.z || 0), expected.z, 0.000001, 'right foot translate z');
  assert(edit?.worldQuat == null, 'right foot translate must not leave a stale worldQuat');
}

function assertSpineAngles(corrections, expected) {
  const edit = editFor(corrections, 'mixamorig:Spine');
  assert(edit?.mode === 'fk', 'spine angle edit should exist in FK mode');
  approx(Number(edit?.rotX || 0), expected.rotX, 0.000001, 'spine rotX angle');
  approx(Number(edit?.rotY || 0), expected.rotY, 0.000001, 'spine rotY angle');
  approx(Number(edit?.rotZ || 0), expected.rotZ, 0.000001, 'spine rotZ angle');
}

const cloneMethod = methodBody('clonePoseCorrections(corrections = this.poseCorrections)');
const restoreMethod = methodBody("restorePoseHistorySnapshot(snapshot, statusText = 'restored pose edit')");
const undoMethod = methodBody('undoPoseCorrection()');
const redoMethod = methodBody('redoPoseCorrection()');
const resetClipMethod = methodBody('resetActiveClipPoseCorrections()');
assert(cloneMethod.includes('JSON.parse(JSON.stringify(corrections || {}))'), 'runtime history must deep-clone correction payloads');
assert(restoreMethod.includes('this.poseCorrections = this.clonePoseCorrections(snapshot.poseCorrections)'), 'runtime restore must replace full pose corrections from snapshot');
assert(undoMethod.includes('this.poseHistory.redo.push(this.poseHistorySnapshot'), 'runtime undo must save current state for redo');
assert(redoMethod.includes('this.poseHistory.undo.push(this.poseHistorySnapshot'), 'runtime redo must save current state for undo');
assert(resetClipMethod.includes("this.pushPoseHistory('reset clip edits')"), 'full clip reset must be undoable');

const harness = new PoseHistoryHarness();
assert(editCount(harness.poseCorrections) === 0, 'initial correction stack should be empty');

harness.mutate('twist left forearm crazy', 'mixamorig:LeftForeArm', {
  mode: 'fk',
  space: 'screen',
  gestureKind: 'twist',
  axisMode: 'selected-bone-twist',
  axisWorld: [0.188144, 0.940721, 0.282216],
  angle: 73 * Math.PI / 180,
  worldQuat: axisAngleQuat([0.2, 1, 0.3], 73),
  rotX: 0,
  rotY: 0,
  rotZ: 0,
});
assertLeftForearmTwist(harness.poseCorrections, 73);
assert(editCount(harness.poseCorrections) === 1, 'after twist there should be one edit');

harness.mutate('translate right foot crazy', 'mixamorig:RightFoot', {
  mode: 'hinge',
  space: 'global',
  gestureKind: 'hinge-pan',
  axisMode: 'pinned-parent-screen-target',
  anchorBoneName: 'mixamorig:RightLeg',
  drivenBoneName: 'mixamorig:RightFoot',
  x: 35,
  y: -48,
  z: 12,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  worldQuat: null,
});
assertLeftForearmTwist(harness.poseCorrections, 73);
assertRightFootTranslate(harness.poseCorrections, { x: 35, y: -48, z: 12 });
assert(editCount(harness.poseCorrections) === 2, 'after foot translate there should be two edits');

harness.mutate('rotate spine crazy', 'mixamorig:Spine', {
  mode: 'fk',
  space: 'local',
  gestureKind: 'numeric-fk',
  x: 0,
  y: 0,
  z: 0,
  rotX: -22,
  rotY: 41,
  rotZ: 13,
  worldQuat: null,
});
assertLeftForearmTwist(harness.poseCorrections, 73);
assertRightFootTranslate(harness.poseCorrections, { x: 35, y: -48, z: 12 });
assertSpineAngles(harness.poseCorrections, { rotX: -22, rotY: 41, rotZ: 13 });
assert(editCount(harness.poseCorrections) === 3, 'crazy pose should contain three arbitrary bone edits');

assert(harness.undo(), 'undo spine rotate should succeed');
assert(!editFor(harness.poseCorrections, 'mixamorig:Spine'), 'first undo should remove spine angles');
assertLeftForearmTwist(harness.poseCorrections, 73);
assertRightFootTranslate(harness.poseCorrections, { x: 35, y: -48, z: 12 });
assert(editCount(harness.poseCorrections) === 2, 'first undo should leave two edits');

assert(harness.undo(), 'undo right foot translate should succeed');
assert(!editFor(harness.poseCorrections, 'mixamorig:RightFoot'), 'second undo should remove right foot translate');
assertLeftForearmTwist(harness.poseCorrections, 73);
assert(editCount(harness.poseCorrections) === 1, 'second undo should leave only twist');

assert(harness.undo(), 'undo left forearm twist should succeed');
assert(editCount(harness.poseCorrections) === 0, 'third undo should return to empty correction stack');

assert(harness.redo(), 'redo left forearm twist should succeed');
assertLeftForearmTwist(harness.poseCorrections, 73);
assert(editCount(harness.poseCorrections) === 1, 'first redo should restore twist only');

assert(harness.redo(), 'redo right foot translate should succeed');
assertLeftForearmTwist(harness.poseCorrections, 73);
assertRightFootTranslate(harness.poseCorrections, { x: 35, y: -48, z: 12 });
assert(editCount(harness.poseCorrections) === 2, 'second redo should restore twist and translate');

assert(harness.redo(), 'redo spine rotate should succeed');
assertLeftForearmTwist(harness.poseCorrections, 73);
assertRightFootTranslate(harness.poseCorrections, { x: 35, y: -48, z: 12 });
assertSpineAngles(harness.poseCorrections, { rotX: -22, rotY: 41, rotZ: 13 });
assert(editCount(harness.poseCorrections) === 3, 'third redo should restore full crazy pose');

harness.resetClip();
assert(editCount(harness.poseCorrections) === 0, 'full reset should clear all arbitrary bone edits');
assert(!editFor(harness.poseCorrections, 'mixamorig:LeftForeArm'), 'full reset should clear twist bone');
assert(!editFor(harness.poseCorrections, 'mixamorig:RightFoot'), 'full reset should clear translated bone');
assert(!editFor(harness.poseCorrections, 'mixamorig:Spine'), 'full reset should clear explicit angle bone');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['arbitrary-bone-crazy-pose', 'explicit-angle-undo-redo', 'translate-undo-redo', 'full-reset-clears-all'] }, null, 2));
