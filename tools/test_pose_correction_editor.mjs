import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const css = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.css'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

for (const id of [
  'touchPoseHud',
  'touchPoseLabel',
  'touchPoseMode',
  'touchPoseSave',
  'touchPoseReset',
  'touchPoseCancel',
  'poseSaveKey',
  'poseResetKey',
  'poseResetClip',
  'poseCompareOverlay',
  'poseEditStatus',
]) {
  assert(html.includes(`id="${id}"`), `pose editor should expose ${id}`);
}

for (const needle of [
  "const POSE_CORRECTIONS_KEY = 'pose-lab:pose-corrections:v1'",
  'readPoseCorrections()',
  'writePoseCorrections()',
  'currentPoseCorrectionKey(true)',
  'poseCorrectionFrames(',
  'mergedCritiqueKeyframes(',
  'applyPoseCorrectionOverlay(actor)',
  'applyPoseIkEdit(name, edit = {})',
  'applyPoseFkEdit(name, edit = {})',
  'ikChainForEndpoint(name)',
  'createTouchRigControls()',
  'updateTouchRigControls()',
  'isIkControlBoneName(name)',
  'setTouchRigControlsVisible(visible)',
  'showTouchRigControls = false',
  '!actor.showTouchRigControls',
  'createRigifyCircleGeometry',
  'createRigifyFootGeometry',
  'new THREE.LineLoop',
  'beginTouchPoseDrag(event)',
  'updateTouchPoseDrag(event)',
  'finishTouchPoseDrag(event)',
  'applyTouchPoseDelta(',
  'touchPoseHud.classList.toggle',
  'playerPoseControls',
  'openCorrectPose()',
  "this.poseEditorMode = 'fk'",
  "this.poseEditorSpace = 'local'",
  "const dragKind = target.kind === 'ik' ? 'ik' : 'fk'",
  'UI.poseSaveKey?.addEventListener',
  'UI.poseResetKey?.addEventListener',
  'UI.poseResetClip?.addEventListener',
  'UI.poseCompareOverlay?.addEventListener',
  'this.poseOverlayEnabled = !this.poseOverlayEnabled',
]) {
  assert(js.includes(needle), `pose-lab.js should include ${needle}`);
}

assert(js.includes('frames.find((frame) => Number(frame.time) > state.currentTime + epsilon)?.time ?? frames[0].time'), 'next key should wrap from last to first');
assert(js.includes("[...frames].reverse().find((frame) => Number(frame.time) < state.currentTime - epsilon)?.time ?? frames[frames.length - 1].time"), 'previous key should wrap from first to last');
assert(js.includes('((currentFrame + Number(deltaFrames || 0)) % (frameCount + 1) + (frameCount + 1)) % (frameCount + 1)'), 'frame stepping should wrap');
assert(css.includes('pose-edit-dock-1.0'), 'pose editor CSS block should exist');
assert(css.includes('touch-pose-hud-3.0'), 'transparent draggable touch pose HUD CSS block should exist');
assert(css.includes('body.phone-controls.critique-mode .pose-edit-dock[open]'), 'numeric pose editor should be advanced fallback only');
assert(css.includes('body.phone-controls.critique-mode #touchPoseHud.active'), 'touch pose HUD should activate without opening a large dock');
assert(!js.includes("openCorrectPose() {\n    this.setPanel('bones');"), 'correct pose should not route to hidden legacy bone panel');
assert(js.includes("const kind = target.kind || 'fk';") || js.includes("const { boneName, kind } = target;"), 'tap fallback should use resolver kind rather than auto-promoting endpoint bones to IK');
assert(js.includes('const hinge = this.hingeTargetDelta(event);'), 'default touch drag should move a projected hinge pinned hinge target');
assert(js.includes('this.screenPlaneFkDelta(event)'), 'explicit twist mode should keep projected origin screen-plane math');
assert(!html.includes('id="poseNudgeX"'), 'default critique editor should not expose giant numeric position sliders');
assert(!html.includes('id="poseRotX"'), 'default critique editor should not expose giant numeric rotation sliders');
assert(js.includes('actor.setBoneOverlayVisible(true);'), 'correct pose should reveal FK skeleton handles so the button has visible effect');
assert(html.includes('id="playerPoseControls"'), 'correct pose should be available as a visible transport button');
assert(!js.match(/openCorrectPose\(\) \{[\s\S]*?this\.selectBone\(boneName, 'fk'\)/), 'opening Correct Pose should not auto-select an FK bone and hide the IK affordance');
assert(js.includes('actor.setTouchRigControlsVisible(true);'), 'opening correct pose should show separate IK handles');
assert(!js.includes('new THREE.TorusGeometry'), 'touch IK handles should not use cluttered torus geometry');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-editor-ui', 'correction-overlay', 'key-wrap'] }, null, 2));
