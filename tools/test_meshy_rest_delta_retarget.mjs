import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const readyStart = profiles.indexOf("retargetMode: 'meshy-fps-visual-ik-ready'");
const restStart = profiles.indexOf("retargetMode: 'fps-upper-key-convert'", readyStart);
const readyBlock = readyStart >= 0 && restStart > readyStart ? profiles.slice(readyStart, restStart) : '';
const restBlockEnd = profiles.indexOf('directRotationPairs:', restStart);
const restBlock = restStart >= 0 && restBlockEnd > restStart ? profiles.slice(restStart, restBlockEnd) : '';

assert(js.includes('function sharedSameNameRotationPairs'), 'runtime should keep mapped retarget helpers');
assert(!js.includes("mapped-chain-up-all-rest-delta"), 'runtime must not expose chain-up-all; it recreated the arm-straight-up Meshy regression');
assert(js.includes("mapped-chain-up-basis-rest-delta"), 'mapped clips should report chain-up basis rest-delta mode');
assert(js.includes("spec.retargetMode === 'mapped-rotation'"), 'auto retarget should keep mapped-rotation mode available');
assert(js.includes("spec.retargetMode === 'fps-upper-key-convert'"), 'auto retarget should retain the legacy/rest-calibration source-key converter');
assert(js.includes("const mappedTag = spec.clipTag || (spec.retargetMode === 'weapon-path-ik' ? 'SABRE' : 'MC')"), 'mapped clips should still support explicit diagnostic suffix tags');
assert(restBlock.includes("clipTag: 'FPS-REST-ARMS-CAL'") && restBlock.includes("retargetMode: 'fps-upper-key-convert'"), 'Meshy rest calibration should retain the source-key converter');
assert(readyBlock.includes("channels: { translate: false, rotate: true, scale: false }"), 'Meshy Ready candidate should be rotate-only');
assert(!readyBlock.includes("sampleFps: 30"), 'Meshy Ready candidate must not use uniform sampled retarget frames');
assert(readyBlock.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'Meshy profile should generate the Visual-IK Ready candidate instead of the retired FPS-SWORD-UPPER ready path');
assert(profiles.includes("SwordReady: ['0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]'"), 'Meshy aliases should prefer the accepted T-pose calibration during recovery');
assert(!profiles.includes("SwordReady: ['OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]'"), 'Meshy aliases must not promote rejected FPS OneHandReady retarget during recovery');
assert(!profiles.includes("SwordAttack1: ['OneHandAttack1 -> meshyCharacter [FPS-SWORD-UPPER]'"), 'Meshy should defer FPS OneHandAttack1 until ready pose is accepted');
for (const rejected of ['Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'Head']) {
  assert(!profiles.includes(`to: '${rejected}'`), `Meshy Ready candidate must not target lower/root/head bone ${rejected}`);
}
assert(!profiles.includes('Armature|Swing1 -> meshyCharacter [CORE]') && !profiles.includes('Armature|Swing1 -> meshyCharacter [MC]'), 'rejected Scavenger mapped fallbacks should not remain in Meshy aliases');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['visual-ik-ready-candidate-retarget', 'lower-body-targets-excluded'] }, null, 2));
