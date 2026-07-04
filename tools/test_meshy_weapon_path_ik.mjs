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
assert(profiles.includes('Saber handle-centered attachment for Meshy Character') && profiles.includes('gripLocalPosition: [0.73272, 0.0091, -0.01674]'), 'Meshy Character should preserve the visible mesh hilt saber oracle');
assert(profiles.includes('gripOffset: [0, 0, 0]'), 'Meshy saber should rotate from the hand origin without shifting the socket');
assert(profiles.includes('handLocalOffset: [0.095, 0.035, -0.01]') && profiles.includes('modelLocalOffset: [0.35, 4.5, -0.17]') && profiles.includes('rotationDeg: [0, 0, 0]') && profiles.includes('rotationDeg: [-67.582, 76.718, -90.52]'), 'Meshy saber should use the visible hand-local grip placement and mesh-layer manual rotation');
assert(profiles.includes("parentMode: 'hand-fk'") && !profiles.includes("syntheticSourceSocketBone: ''"), 'Meshy saber should use the accepted boring direct hand-FK profile path');
assert(profiles.includes("clipTag: 'FPS-SWORD-UPPER'"), 'Meshy FPS-SWORD-UPPER remains available as an unpromoted weapon diagnostic');
assert(profiles.includes("clipTag: 'FPS-VISUAL-IK-READY'"), 'Meshy Visual-IK Ready should be available as an explicit review candidate');
assert(!profiles.includes("targetWeapon: 'WeaponGrip'") && !profiles.includes("targetWeapon: 'WeaponR'"), 'Meshy Ready candidates must not animate WeaponGrip or WeaponR; boring FK owns weapon follow');
assert(!profiles.includes("retargetMode: 'weapon-path-ik'"), 'Meshy active profile should not request the rejected weapon-path IK acceptance path');
assert(!profiles.includes("clipTag: 'IB-MC'") && !profiles.includes("clipTag: 'RA-FULL'"), 'Meshy active profile should not generate rejected full-body/RA weapon clips');
assert(!profiles.includes("pathMode: 'authored-diagonal-cut'"), 'the authored Scavenger fallback path should not remain in the active Meshy profile');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['fps-sword-weapon-visible', 'rejected-weapon-path-acceptance-removed'] }, null, 2));
