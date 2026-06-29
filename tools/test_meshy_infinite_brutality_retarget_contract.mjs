import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes("const LAB_BUILD = 'meshy-fps-sword-upper-body-retarget'"), 'runtime build should identify the FPS sword upper-body pivot');
assert(js.includes("canonicalBoneName(sourceName).replace(/^mixamorig/, '')"), 'chain-up basis should still normalize Mixamo prefixes without breaking FPS names');
assert(js.includes("const customOriginPrefix = spec.originPrefix ||"), 'auto retarget specs should be able to preserve mapped-arms origin identity');
assert(profiles.includes("startupClip: { name: 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]' }"), 'Meshy startup should use FPS OneHandReady upper-body clip');
assert(profiles.includes("sourceKey: 'player'"), 'Meshy should source sword retargets from FPS Arms');
assert(profiles.includes("clipTag: 'FPS-SWORD-UPPER'"), 'Meshy sword clips should use FPS-SWORD-UPPER tag');
assert(profiles.includes("clipNames: [\n          'OneHandReady',\n        ]"), 'Meshy should retarget only FPS OneHandReady in this slice');
for (const deferred of ['OneHandReadied -> meshyCharacter', 'OneHandAttack1 -> meshyCharacter', 'OneHandAttack2 -> meshyCharacter', 'OneHandAttack3 -> meshyCharacter', 'OneHandAttack4 -> meshyCharacter', 'OneHandAttack5 -> meshyCharacter', 'OneHandAirForwardAttack -> meshyCharacter']) {
  assert(!profiles.includes(deferred), `Meshy should defer generated attack/readied clip: ${deferred}`);
}
assert(profiles.includes("channels: { translate: false, rotate: true, scale: false }"), 'Meshy sword clips should be rotate-only');
assert(profiles.includes("positionPolicy: 'none'"), 'Meshy sword clips should not bake position channels');
assert(profiles.includes("retargetMode: 'fps-upper-key-convert'"), 'Meshy should use FPS source key conversion');
assert(profiles.includes("originPrefix: 'mapped-arms:player->meshyCharacter'"), 'Meshy FPS sword clips should preserve mapped-arms origin');
assert(profiles.includes("{ from: 'Arm.R', to: 'RightArm', strength: 0.85 }"), 'right upper arm should be converted from authored FPS Arm.R keys');
assert(profiles.includes("{ from: 'Forearm.R', to: 'RightForeArm', strength: 1.0 }"), 'right forearm should be converted from authored FPS Forearm.R keys');
assert(profiles.includes("{ from: 'Hand.R', to: 'RightHand', strength: 1.0 }"), 'right hand should be converted from authored FPS Hand.R keys');
assert(profiles.includes("sourceWeapon: 'Weapon.R'") && profiles.includes("targetWeapon: 'WeaponGrip'"), 'WeaponGrip should be converted from authored FPS Weapon.R keys');
for (const rejected of ["sourceKey: 'orc'", "clipTag: 'IB-MC'", "standing_melee_attack_horizontal -> meshyCharacter", "mixamorigHips", "mixamorigRightUpLeg", "to: 'LeftFoot'", "to: 'RightFoot'", "to: 'Head'"]) {
  assert(!profiles.includes(rejected), `Meshy sword profile must not retain rejected full-body token: ${rejected}`);
}
assert(!profiles.includes('Armature|Swing1 -> meshyCharacter'), 'Meshy aliases should not prefer rejected Scavenger Swing clips');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-fps-sword-ready-only-retarget', 'onehandready-source-clip', 'no-full-body-or-scavenger-source'] }, null, 2));
