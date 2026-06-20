import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function methodBody(signature) {
  const start = source.indexOf(signature);
  if (start < 0) return '';
  let depth = 0;
  let opened = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') { depth += 1; opened = true; }
    if (char === '}') {
      depth -= 1;
      if (opened && depth === 0) return source.slice(start, index + 1);
    }
  }
  return '';
}

const renderClipButtons = methodBody('  renderClipButtons() {');
const executeDebugCommand = methodBody('  async executeDebugCommand(input) {');

const applyBoneEdit = methodBody('  applyBoneEdit(name, edit) {');
const playMethod = methodBody('  play(name) {');
assert(applyBoneEdit.includes('if (!this.activeAction)'), 'bone edits on a playing clip should preserve the current sampled animation pose before applying edit deltas');
assert(applyBoneEdit.includes('this.boneEdits.set(name, next);'), 'bone edits should be stored before reapplication during animation updates');
assert(playMethod.includes('next.paused = false;'), 'actor.play should always unpause the newly selected action');
assert(playMethod.includes('this.mixer.setTime(0);'), 'actor.play should restart the selected clip from the beginning');

assert(renderClipButtons.includes('actor.play(entry.key);'), 'clip buttons should still route through actor.play(entry.key)');
assert(renderClipButtons.includes("this.critiqueTransportMode = 'live';"), 'selecting a clip in critique mode should put transport back into live playback');
assert(renderClipButtons.includes('actor.pauseActive(false);'), 'selecting a clip should explicitly unpause the selected action');
assert(renderClipButtons.includes('this.updatePlayerTransportUi('), 'selecting a clip should refresh the player transport readout');
assert(renderClipButtons.includes('this.updateCritiqueTransportUi('), 'selecting a clip should refresh the critique transport readout');

assert(executeDebugCommand.includes("case 'clip':"), 'debug command should still support clip selection');
const clipCase = executeDebugCommand.slice(executeDebugCommand.indexOf("case 'clip':"), executeDebugCommand.indexOf("case 'bone':"));
assert(clipCase.includes("this.critiqueTransportMode = 'live';"), 'debug clip selection should put transport back into live playback');
assert(clipCase.includes('actor.pauseActive(false);'), 'debug clip selection should explicitly unpause the selected action');
assert(clipCase.includes('activeClipChanged'), 'debug clip selection should report whether the active clip changed');
assert(clipCase.includes('paused: false'), 'debug clip selection should report that playback is not paused after selection');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['critique-clip-selection-playback-contract'] }, null, 2));
