import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(!profiles.includes("clipTag: 'FPS-JOINT-FK'"), 'failed FPS-JOINT-FK candidate should not be active in Meshy profile');
assert(!profiles.includes('candidate-joint-fk:player->meshyCharacter'), 'failed joint-FK origin should not be linked from Meshy profile');
assert(!profiles.includes("SwordReady: ['OneHandReady -> meshyCharacter [FPS-JOINT-FK]'"), 'failed joint-FK clip should not be SwordReady');
assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'Meshy startup should remain on accepted T-pose calibration');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['failed-joint-fk-not-active', 'tpose-startup-protected'] }, null, 2));
