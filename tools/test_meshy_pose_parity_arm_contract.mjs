import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const readyRuntime = fs.readFileSync(path.join(projectRoot, 'src', 'meshy-ready-runtime.mjs'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes("buildMeshyFpsVisualIkReadyClip"), 'runtime should import the shared Meshy Visual IK Ready pose generator');
assert(js.includes("spec.retargetMode === 'meshy-fps-visual-ik-ready'"), 'auto retarget dispatch should have an explicit pose-only Meshy Ready mode');
assert(profiles.includes("retargetMode: 'meshy-fps-visual-ik-ready'"), 'Meshy Ready should use the pose-only visual IK mode');
assert(profiles.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'Meshy Ready should be tagged as the visual IK golden candidate');
assert(profiles.includes("SwordReady: ['0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]'"), 'SwordReady alias should remain on the accepted T-pose/rest baseline');
assert(!profiles.includes("SwordReady: ['OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]'"), 'Visual IK Ready must remain candidate-only and not be promoted to SwordReady');
assert(profiles.includes("timeSourceBone: 'Hand.R'") && profiles.includes('dropInitialRestKey: true'), 'Ready pose should preserve source-key timing while dropping the initial rest key');
assert(profiles.includes("rightRollOffsetDeg: -120") && profiles.includes("leftRollOffsetDeg: -90"), 'Ready pose should preserve accepted right/left roll offsets');
assert(!profiles.includes("targetWeapon: 'WeaponGrip'"), 'normal Meshy Ready generation must not key WeaponGrip');
assert(!profiles.includes("sourceWeapon: 'Weapon.R'"), 'normal Meshy Ready generation must not depend on FPS Weapon.R');
assert(!profiles.includes("weaponKeyConvert: {"), 'normal Meshy Ready generation must not carry the old weapon conversion block');
assert(readyRuntime.includes('world-joint-projection source-authored-times'), 'shared Ready helper should report world-joint projection metadata');
assert(readyRuntime.includes('weaponTrackEnabled: Boolean(weaponTrack)'), 'shared Ready helper should expose whether a weapon track was emitted');
assert(js.includes('weaponAttachment: target.info?.weaponAttachment || {}') && !js.includes('experimentalWeaponSwing: true'), 'runtime call site should not enable experimental weapon tracks');

if (failures.length) throw new Error(failures.join('\\n'));
console.log(JSON.stringify({ checked: ['meshy-visual-ik-ready-pose-only', 'no-normal-weapon-tracks'] }, null, 2));
