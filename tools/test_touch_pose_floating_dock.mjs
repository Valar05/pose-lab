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
  'touchPoseDockHandle',
  'touchPoseUndo',
  'touchPoseRedo',
  'touchPoseSave',
  'touchPoseReset',
  'touchPoseCancel',
  'touchPoseModeToggle',
  'touchPosePose',
  'touchPoseClips',
]) {
  assert(html.includes(`id="${id}"`), `floating touch pose dock should expose ${id}`);
  assert(js.includes(`${id}: document.getElementById('${id}')`), `runtime UI map should include ${id}`);
}

for (const needle of [
  "UI.touchPoseUndo?.addEventListener('click', () => this.undoPoseCorrection())",
  "UI.touchPoseRedo?.addEventListener('click', () => this.redoPoseCorrection())",
  "UI.touchPoseModeToggle?.addEventListener('click', () => this.toggleSelectedTouchEditMode())",
  "UI.touchPosePose?.addEventListener('click', () => this.openCorrectPose())",
  "UI.touchPoseClips?.addEventListener('click', () => this.setPanel(this.activePanel === 'clips' ? 'none' : 'clips'))",
]) {
  assert(js.includes(needle), `floating dock should wire action: ${needle}`);
}

assert(html.includes('class="touch-pose-hud pose-floating-dock"'), 'touch pose HUD should be marked as a floating dock');
assert(css.includes('touch-pose-hud-3.0'), 'CSS should include the transparent draggable dock revision block');
assert(css.includes('position: fixed;'), 'floating dock should be viewport-positioned');
assert(css.includes('background: rgba(4,8,11,0.24)'), 'floating dock outer box should be transparent');
assert(css.includes('body.phone-controls.critique-mode #touchPoseHud.dock-dragged'), 'floating dock should have a dragged-position state');
assert(css.includes('touch-action: none;'), 'dock drag handle should own its pointer drag');
assert(css.includes('body.phone-controls.critique-mode #touchPoseHud button:disabled'), 'undo/redo disabled state should be visible');
assert(css.includes('body.phone-controls.critique-mode #touchPoseModeToggle'), 'mode toggle should have a distinct dock style');
assert(js.includes('beginTouchPoseDockDrag(event)'), 'runtime should implement dock drag start');
assert(js.includes('updateTouchPoseDockDrag(event)'), 'runtime should implement dock drag move');
assert(js.includes('finishTouchPoseDockDrag(event)'), 'runtime should implement dock drag finish');
assert(js.includes('captureTouchPoseDockPosition()'), 'runtime should persist the dragged dock position');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['floating-touch-pose-dock'] }, null, 2));
