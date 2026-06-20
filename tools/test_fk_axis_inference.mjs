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

const roleFn = js.match(/function fkBoneRole\(name\) \{[\s\S]*?\n\}/)?.[0] || '';
const infer = methodBody('inferFkAxis(actor, boneName)');
const context = methodBody('screenPlaneFkContext(actor, boneName, event)');
const delta = methodBody('screenPlaneFkDelta(event)');
const apply = methodBody('applyTouchPoseDelta(event)');

assert(roleFn.includes('lowerLeg') && roleFn.includes('forearm') && roleFn.includes('upperLeg') && roleFn.includes('upperArm'), 'FK axis inference should classify major limb roles');
assert(infer.includes('boneDirWorld'), 'axis inference should compute bone longitudinal direction');
assert(infer.includes('parentDirWorld'), 'axis inference should compute parent direction');
assert(infer.includes('chainPlaneNormalWorld'), 'axis inference should compute chain plane normal');
assert(infer.includes("role === 'lowerLeg' || role === 'forearm'"), 'lower legs and forearms should use hinge-like chain-plane axis');
assert(infer.includes("axisMode: 'inferred-hinge'"), 'hinge axis mode should be explicit');
assert(infer.includes("axisMode: 'inferred-swing'"), 'upper limb swing axis mode should be explicit');
assert(infer.includes("axisMode: 'fallback-screen'"), 'fallback screen axis should be explicit and limited');
assert(infer.includes('avoidLongitudinalTwist'), 'axis inference should actively avoid longitudinal twist by default');
assert(context.includes('axisInfo: this.inferFkAxis(actor, boneName)'), 'FK context should cache inferred axis info');
assert(delta.includes('fk.axisInfo?.axisWorld'), 'FK delta should use inferred axis world vector');
assert(!delta.includes('this.camera.getWorldDirection(axis);\n    const delta'), 'FK delta should not use camera-forward as the default rotation axis');
assert(apply.includes('next.axisMode = fkDelta.axisMode;'), 'FK correction should store axis mode metadata');
assert(apply.includes('next.axisWorld = fkDelta.axisWorld;'), 'FK correction should store axis world metadata');
assert(apply.includes('next.angle = fkDelta.angle;'), 'FK correction should store signed angle metadata');
assert(apply.includes('next.worldQuat = fkDelta.worldQuat.toArray();'), 'FK correction should still store resulting world quaternion');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['fk-axis-inference', 'hinge-not-twist', 'axis-metadata'] }, null, 2));
