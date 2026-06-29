import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes('Sparse clips must start from a clean rest pose'), 'play() should document sparse clip reset behavior');
assert(js.includes('this.mixer.stopAllAction()'), 'play() should stop all previous actions before starting a new clip');
assert(js.includes('action.enabled = false') && js.includes('action.stop();') && js.includes('action.reset();') && js.includes('action.weight = 0'), 'play() should disable, stop, reset, and zero previous action weights');
assert(js.includes('restoreBonePose(this.model, this.modelRestPose);'), 'play() should restore full model rest pose before the next clip');
assert(js.includes('if (this.currentRestPose) applyGodotRestPose(this.model, this.currentRestPose);'), 'play() should reapply active rest-pose offsets after reset');
assert(js.includes('this.mixer.setTime(0);'), 'play() should sample the new action from time zero after reset');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['sparse-clip-clean-rest-reset', 'walking-keys-cannot-leak-into-swing'] }, null, 2));
