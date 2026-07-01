import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes('function buildWeaponPathIkClips'), 'runtime can still build weapon-path IK diagnostics outside the active Meshy path');
assert(js.includes("spec.retargetMode === 'weapon-path-ik'"), 'auto retarget dispatch still supports weapon-path-ik for non-accepted experiments');
assert(js.includes('createWeaponProxy()'), 'runtime should create a WeaponGrip socket/fallback sabre from the target hands');
assert(js.includes('attachWeaponAttachment(weaponRoot, config = {})'), 'runtime should attach the downloaded Meshy sabre model to WeaponGrip');
assert(js.includes('updateWeaponProxyVisibility()'), 'weapon socket visibility should be runtime-controlled');
assert(js.includes('this.weaponProxy.root.visible = true') && js.includes('this.weaponProxy.model.visible = true'), 'weapon should stay visible without clip-pattern gates');
assert(profiles.includes("weaponAttachment: {") && profiles.includes("socketBone: 'WeaponGrip'") && profiles.includes("leftHandBone: 'LeftHand'"), 'Meshy profile should attach the real Meshy sabre to the centered WeaponGrip');
assert(profiles.includes('Saber handle-centered attachment for Meshy Character') && profiles.includes('gripLocalPosition: [0.6535, -0.02302, -0.07317]'), 'Meshy Character should preserve the rig-local saber hilt candidate');
assert(profiles.includes('gripOffset: [0, 0, 0]'), 'Meshy saber should rotate from the hand origin without shifting the socket');
assert(profiles.includes('handLocalOffset: [0.095, 0.035, -0.01]') && profiles.includes('modelLocalOffset: [-0.11512, 0.00773, -0.01127]') && profiles.includes('rotationDeg: [90, 0, -55.145]'), 'Meshy saber should use the hard-won rig-local socket position and rotation');
assert(profiles.includes("parentMode: 'synthetic-source-socket'") && profiles.includes("syntheticSourceSocketBone: 'WeaponR'"), 'Meshy saber should follow the right hand through a synthetic FPS-style WeaponR socket');
assert(profiles.includes("clipTag: 'FPS-SWORD-UPPER'"), 'Meshy FPS-SWORD-UPPER remains available as an unpromoted weapon diagnostic');
assert(profiles.includes("sourceWeapon: 'Weapon.R'") && profiles.includes("targetWeapon: 'WeaponR'") && profiles.includes('enabled: true'), 'FPS Weapon.R metadata should drive synthetic Meshy WeaponR while preserving WeaponGrip manual attachment offsets');
assert(!profiles.includes("retargetMode: 'weapon-path-ik'"), 'Meshy active profile should not request the rejected weapon-path IK acceptance path');
assert(!profiles.includes("clipTag: 'IB-MC'") && !profiles.includes("clipTag: 'RA-FULL'"), 'Meshy active profile should not generate rejected full-body/RA weapon clips');
assert(!profiles.includes("pathMode: 'authored-diagonal-cut'"), 'the authored Scavenger fallback path should not remain in the active Meshy profile');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['fps-sword-weapon-visible', 'rejected-weapon-path-acceptance-removed'] }, null, 2));
