import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes('function buildWeaponPathIkClips'), 'runtime can still build weapon-path IK diagnostics outside the active Meshy path');
assert(js.includes("spec.retargetMode === 'weapon-path-ik'"), 'auto retarget dispatch still supports weapon-path-ik for non-accepted experiments');
assert(!profiles.includes("clipTag: 'SABRE'"), 'Meshy active profile should not generate the rejected SABRE diagnostic clip');
assert(profiles.includes('debugArcColor: 0x42e9ff'), 'Meshy proxy should configure a visible cyan debug arc');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['weapon-path-helper-retained', 'active-meshy-sabre-diagnostic-removed'] }, null, 2));
