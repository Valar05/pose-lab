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
assert(js.includes('visibleClipPatterns') && js.includes("patterns.some((pattern) => new RegExp(pattern).test(clip?.name || ''))"), 'weapon should be visible on accepted configured sword clips');
assert(profiles.includes("weaponAttachment: {") && profiles.includes("socketBone: 'WeaponGrip'") && profiles.includes("leftHandBone: 'LeftHand'"), 'Meshy profile should attach the real Meshy sabre to the centered WeaponGrip');
assert(profiles.includes('Saber handle solved attachment for Meshy Character') && profiles.includes('gripLocalPosition: [0.78, -0.3, 0]'), 'Meshy Character should grip the saber handle, not the middle of the prop');
assert(profiles.includes("clipTag: 'FPS-SWORD-UPPER'"), 'Meshy accepted weapon-visible clips should be FPS-SWORD-UPPER');
assert(profiles.includes("sourceWeapon: 'Weapon.R'") && profiles.includes("targetWeapon: 'WeaponGrip'"), 'FPS Weapon.R rotation should drive Meshy WeaponGrip through source-key conversion');
assert(!profiles.includes("retargetMode: 'weapon-path-ik'"), 'Meshy active profile should not request the rejected weapon-path IK acceptance path');
assert(!profiles.includes("clipTag: 'IB-MC'") && !profiles.includes("clipTag: 'RA-FULL'"), 'Meshy active profile should not generate rejected full-body/RA weapon clips');
assert(!profiles.includes("pathMode: 'authored-diagonal-cut'"), 'the authored Scavenger fallback path should not remain in the active Meshy profile');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['fps-sword-weapon-visible', 'rejected-weapon-path-acceptance-removed'] }, null, 2));
