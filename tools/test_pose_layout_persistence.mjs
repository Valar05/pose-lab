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

const saveState = methodBody('saveState()');
for (const needle of [
  'viewAngle: this.captureViewAngle()',
  'critiqueTransportMode: this.critiqueTransportMode || \'step\'',
  'dockState: {',
  'critiqueDockOpen: Boolean(UI.critiqueDock?.open)',
  'poseEditDockOpen: Boolean(UI.poseEditDock?.open)',
  'touchPoseDockPosition: this.captureTouchPoseDockPosition()',
]) {
  assert(saveState.includes(needle), `saveState should persist ${needle}`);
}

const restore = methodBody('applySavedLayoutState()');
for (const needle of [
  "['step', 'live', 'loop', 'pingpong'].includes(this.savedState.critiqueTransportMode)",
  'this.critiqueTransportMode = this.savedState.critiqueTransportMode',
  'this.critiqueApplyPlaybackMode()',
  'UI.critiqueDock.open = dockState.critiqueDockOpen',
  'UI.poseEditDock.open = dockState.poseEditDockOpen',
  'this.applyTouchPoseDockPosition(dockState.touchPoseDockPosition)',
  'this.applySavedViewAngle(this.savedState.viewAngle)',
]) {
  assert(restore.includes(needle), `layout restore should include ${needle}`);
}

const start = js.slice(js.indexOf('async start()'), js.indexOf('  readSavedState()'));
assert(start.includes('this.applySavedLayoutState();'), 'startup should restore saved layout after actor selection');
assert(js.includes("this.controls.addEventListener('change', () => {\n      if (this.viewMode === 'orbit') this.queueStateSave();"), 'orbit control changes should queue layout/view persistence');
assert(js.includes('details.addEventListener(\'toggle\', () => {\n        this.queueStateSave();'), 'details dock toggles should queue layout persistence');
assert(!restore.includes('selectedBoneName'), 'layout restore should not resurrect stale bone selection');
assert(!restore.includes('touchPoseDrag'), 'layout restore should not resurrect active drag state');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['layout-view-angle-persistence'] }, null, 2));
