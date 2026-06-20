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

const pickTarget = methodBody('pickTouchPoseTarget(event, actor = this.actors.get(this.selected))');
const controlDistance = methodBody('touchControlScreenDistance(event, control)');
const beginDrag = methodBody('beginTouchPoseDrag(event)');
const pickBoneHandle = methodBody('pickBoneHandle(event)');

assert(controlDistance.includes('screenPointForWorld(control.getWorldPosition(new THREE.Vector3()), this.camera, rect)'), 'IK control target resolver should compare projected screen distance, not raycast depth only');
assert(controlDistance.includes('Math.hypot(event.clientX - screen.x, event.clientY - screen.y)'), 'IK control distance should be measured from the finger in screen space');
assert(pickTarget.includes('const screenHit = this.pickNearestScreenBone(event, actor);'), 'target resolver should always consider nearest projected skeleton bone');
assert(pickTarget.includes('const controlDistance = this.touchControlScreenDistance(event, control);'), 'target resolver should measure control distance before choosing it');
assert(pickTarget.includes('screenHit.distance + 10 < controlDistance'), 'screen bone should beat a farther IK control to prevent opposite-foot first-drag selection');
assert(pickTarget.includes("return { boneName: screenHit.boneName, kind: 'fk', source: 'screen-bone'"), 'screen-bone winner should select the bone under the finger as FK/hinge');
assert(pickTarget.includes("return { boneName: control.userData.boneName, kind: control.userData.controlKind || 'fk', source: 'touch-control'"), 'near IK controls should still be selectable when they are actually closest');
assert(pickBoneHandle.includes('const target = this.pickTouchPoseTarget(event, actor);'), 'tap selection should share the same target resolver as drag selection');
assert(beginDrag.includes('const target = this.pickTouchPoseTarget(event, actor);'), 'drag selection should use the shared target resolver');
assert(beginDrag.indexOf('this.selectBone(boneName, selectKind,') < beginDrag.indexOf('this.applyPoseCorrectionOverlay(actor);'), 'first drag should select the intended bone before replaying any stale correction overlay');
assert(!beginDrag.includes('const controlHit = this.pickTouchRigControlHits(event, actor)[0]?.object || null;'), 'begin drag should not blindly accept the first raycast IK control hit');
assert(!beginDrag.includes('const boneHit = controlHit ? null : this.pickNearestScreenBone(event, actor);'), 'begin drag should not suppress screen-bone picking just because an IK control was hit');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['first-drag-target-resolver', 'screen-bone-beats-distant-control', 'select-before-overlay'] }, null, 2));
