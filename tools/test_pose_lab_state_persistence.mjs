import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');

const requiredSnippets = [
  "schema: 'pose-lab-ui-state-v2'",
  'actorLabel:',
  'activePanel:',
  'viewAngle: this.captureViewAngle()',
  'clipSearch:',
  'clipSearches: this.actorSearchState()',
  "'SF2 poseclips: '",
  'Showing all ',
  'applySavedViewAngle(this.savedState.viewAngle)',
  'this.savedState?.actorKey === actorKey ? true : preferSavedClipForActor',
  'this.controls.addEventListener(\'change\'',
  'if (actor) actor.clipSearch = UI.clipSearch.value;\n      this.renderClipButtons();\n      this.saveState();',
];

for (const snippet of requiredSnippets) {
  if (!source.includes(snippet)) throw new Error(`Pose Lab state persistence contract missing snippet: ${snippet}`);
}

const startIndex = source.indexOf('async start()');
const readSavedMethodIndex = source.indexOf('  readSavedState()', startIndex);
const startBlock = source.slice(startIndex, readSavedMethodIndex);
if (!startBlock.includes('this.isRestoringState = true;') || !startBlock.includes('this.isRestoringState = false;')) {
  throw new Error('Startup restore must suppress saveState while saved UI state is being applied');
}

const saveStateBlock = source.slice(source.indexOf('saveState() {'), source.indexOf('findSavedClip(actor'));
for (const field of ['actorKey', 'activePanel', 'viewMode', 'viewAngle', 'clipKey', 'clipSearches']) {
  if (!saveStateBlock.includes(field)) throw new Error(`saveState no longer writes ${field}`);
}

console.log('PASS test_pose_lab_state_persistence');
