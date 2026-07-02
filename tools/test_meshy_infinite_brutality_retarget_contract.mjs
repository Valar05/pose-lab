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

assert(js.includes("const LAB_BUILD = 'meshy-fps-sword-upper-body-retarget'"), 'runtime build should identify the FPS sword upper-body pivot');
assert(js.includes("canonicalBoneName(sourceName).replace(/^mixamorig/, '')"), 'chain-up basis should still normalize Mixamo prefixes without breaking FPS names');
assert(js.includes("const customOriginPrefix = spec.originPrefix ||"), 'auto retarget specs should be able to preserve mapped-arms origin identity');
assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'Meshy startup should use the accepted T-pose calibration until ready passes artifact review');
assert(!profiles.includes("startupClip: { name: 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]' }"), 'Meshy startup must not use rejected FPS OneHandReady retarget during recovery');
assert(!profiles.includes("SwordReady: ['OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]'"), 'Meshy SwordReady alias must not select the rejected ready retarget');
assert(profiles.includes("SwordReady: ['0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]'"), 'Meshy SwordReady alias should remain on the accepted rest calibration');
assert(profiles.includes("sourceKey: 'player'"), 'Meshy should source ready retargets from FPS Arms');
assert(readyBlock, 'Meshy ready generation should include a Visual-IK Ready spec before the accepted rest calibration spec');
assert(readyBlock.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'Meshy ready generation should produce the Visual-IK golden candidate');
assert(readyBlock.includes("clipNames: [\n          'OneHandReady',\n        ]"), 'Meshy should retarget only FPS OneHandReady in this slice');
for (const deferred of ['OneHandReadied -> meshyCharacter', 'OneHandAttack1 -> meshyCharacter', 'OneHandAttack2 -> meshyCharacter', 'OneHandAttack3 -> meshyCharacter', 'OneHandAttack4 -> meshyCharacter', 'OneHandAttack5 -> meshyCharacter', 'OneHandAirForwardAttack -> meshyCharacter']) {
  assert(!profiles.includes(deferred), `Meshy should defer generated attack/readied clip: ${deferred}`);
}
assert(readyBlock.includes("channels: { translate: false, rotate: true, scale: false }"), 'Meshy ready clips should be rotate-only');
assert(readyBlock.includes("positionPolicy: 'none'"), 'Meshy ready clips should not bake position channels');
assert(!readyBlock.includes("retargetMode: 'fps-upper-key-convert'"), 'Meshy should not use the retired FPS source-key conversion as the normal ready path');
assert(!readyBlock.includes("clipTag: 'FPS-SWORD-UPPER'"), 'Meshy should not generate the retired FPS-SWORD-UPPER clip as normal ready output');
assert(readyBlock.includes("originPrefix: 'mapped-arms:player->meshyCharacter:FPS-VISUAL-IK-GOLDEN'"), 'Meshy ready clips should preserve the Visual-IK mapped-arms origin');
assert(!readyBlock.includes("sourceWeapon: 'Weapon.R'") && !readyBlock.includes("targetWeapon: 'WeaponGrip'"), 'normal Ready generation must not key WeaponGrip from authored FPS Weapon.R');
assert(!readyBlock.includes('weaponKeyConvert: {'), 'normal Ready generation must not carry retired weapon conversion settings');
assert(readyBlock.includes('worldJointProjection: {') && readyBlock.includes("mode: 'world-joint-projection'"), 'active ready profile should use constrained world-joint projection');
for (const rejected of ["sourceKey: 'orc'", "clipTag: 'IB-MC'", "standing_melee_attack_horizontal -> meshyCharacter", "mixamorigHips", "mixamorigRightUpLeg", "to: 'LeftFoot'", "to: 'RightFoot'", "to: 'Head'"]) {
  assert(!profiles.includes(rejected), `Meshy sword profile must not retain rejected full-body token: ${rejected}`);
}
assert(!profiles.includes('Armature|Swing1 -> meshyCharacter'), 'Meshy aliases should not prefer rejected Scavenger Swing clips');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-visual-ik-ready-only-retarget', 'accepted-tpose-startup-and-alias', 'no-full-body-scavenger-or-weapon-key-source'] }, null, 2));
