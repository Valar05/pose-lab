import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes('function sharedSameNameRotationPairs'), 'runtime should keep mapped retarget helpers');
assert(!js.includes("mapped-chain-up-all-rest-delta"), 'runtime must not expose chain-up-all; it recreated the arm-straight-up Meshy regression');
assert(js.includes("mapped-chain-up-basis-rest-delta"), 'mapped clips should report chain-up basis rest-delta mode');
assert(js.includes("spec.retargetMode === 'mapped-rotation'"), 'auto retarget should keep mapped-rotation mode available');
assert(js.includes("spec.retargetMode === 'fps-upper-key-convert'"), 'auto retarget should dispatch Meshy sword clips through source-key conversion');
assert(js.includes("const mappedTag = spec.clipTag || (spec.retargetMode === 'weapon-path-ik' ? 'SABRE' : 'MC')"), 'mapped clips should support explicit FPS-SWORD-UPPER suffix tags');
assert(profiles.includes("retargetMode: 'fps-upper-key-convert'"), 'Meshy profile should request source-authored upper-body key conversion');
assert(profiles.includes("channels: { translate: false, rotate: true, scale: false }"), 'Meshy FPS sword clips should be rotate-only');
assert(!profiles.includes("sampleFps: 30"), 'Meshy accepted FPS sword path must not use uniform sampled retarget frames');
assert(profiles.includes("clipTag: 'FPS-SWORD-UPPER'"), 'Meshy profile should generate FPS-SWORD-UPPER clips');
assert(profiles.includes("SwordReady: ['0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]'"), 'Meshy aliases should prefer the accepted T-pose calibration during recovery');
assert(!profiles.includes("SwordReady: ['OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]'"), 'Meshy aliases must not promote rejected FPS OneHandReady retarget during recovery');
assert(!profiles.includes("SwordAttack1: ['OneHandAttack1 -> meshyCharacter [FPS-SWORD-UPPER]'"), 'Meshy should defer FPS OneHandAttack1 until ready pose is accepted');
for (const rejected of ['Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'Head']) {
  assert(!profiles.includes(`to: '${rejected}'`), `Meshy FPS sword retarget must not target lower/root/head bone ${rejected}`);
}
assert(!profiles.includes('Armature|Swing1 -> meshyCharacter [CORE]') && !profiles.includes('Armature|Swing1 -> meshyCharacter [MC]'), 'rejected Scavenger mapped fallbacks should not remain in Meshy aliases');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['fps-sword-source-key-convert-retarget', 'lower-body-targets-excluded'] }, null, 2));
