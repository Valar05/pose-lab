import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes('function buildFpsUpperKeyConvertClips'), 'Meshy sword clips should use the FPS upper source-key converter');
assert(js.includes("mode: 'fps-upper-key-convert source-authored-times"), 'converted Meshy sword clips should identify source-authored key conversion');
assert(js.includes("ikMode === 'source-key-correction'") && js.includes('ikPreservesSourceTracks'), 'converter should support IK-guided correction without replacing source tracks');
assert(js.includes('quaternionFromBladeFrame(mappedBlade, mappedUp)') && js.includes('weaponFrameSolve'), 'converter should expose measured WeaponGrip frame solve metadata');
assert(js.includes('sourceWeaponRelativeToWrist') && js.includes("new THREE.QuaternionKeyframeTrack(targetWeaponName + '.quaternion'"), 'converter should key WeaponGrip from Weapon.R relative to Hand.R');
assert(js.includes('sourceWeaponTrack.times.slice()'), 'WeaponGrip should preserve authored Weapon.R key times');
assert(!profiles.includes("retargetMode: 'position-guided-arm',\n        clipTag: 'FPS-SWORD-UPPER'"), 'accepted Meshy FPS-SWORD-UPPER path must not use sampled position-guided IK');
assert(!profiles.includes('copiedSourceLayer') && !js.includes('syncCopiedSourceLayer'), 'Meshy ready review should not create a copied FPS actor overlay');
assert(profiles.includes("parentMode: 'hand-fk'") && !profiles.includes("syntheticSourceSocketBone: ''"), 'Meshy profile must use direct hand-fk without an empty synthetic socket override');
assert(!profiles.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'Meshy profile must not promote the failed Visual-IK golden Ready path');

assert(profiles.includes("retargetMode: 'world-joint-projection'"), 'Meshy FPS-SWORD-UPPER config should use source-authored world joint projection for Ready pose');
assert(profiles.includes("sourceUpper: 'Arm.R'") && profiles.includes("targetUpper: 'RightArm'"), 'Meshy FPS-SWORD-UPPER should solve the right arm from authored FPS world joints');
assert(profiles.includes("sourceHand: 'Hand.R'") && profiles.includes("targetHand: 'RightHand'"), 'Meshy ready pose should map authored FPS hand joints onto Meshy hands');
assert(!profiles.includes("sourceWeapon: 'Weapon.R'") || !profiles.includes("clipTag: 'FPS-SWORD-UPPER'") || !profiles.slice(profiles.indexOf("clipTag: 'FPS-SWORD-UPPER'"), profiles.indexOf("clipTag: 'FPS-REST-ARMS-CAL'")).includes('weaponKeyConvert'), 'Meshy Ready must not key WeaponGrip; boring FK runtime owns weapon follow');
assert(js.includes('if (guidedTracks.length && !ikPreservesSourceTracks)'), 'replacement IK should be guarded away from the active source-key correction mode');
assert(profiles.includes("positionMode: 'right-hand'"), 'Meshy one-hand saber socket should be positioned on the right hand, not the two-hand midpoint');
assert(profiles.includes("targetHand: 'RightHand'") && profiles.includes("parentMode: 'hand-fk'"), 'Meshy right hand should drive the direct hand-FK weapon socket');
assert(profiles.includes("from: 'Hand.L', to: 'LeftHand'") && profiles.includes("from: 'Hand.R', to: 'RightHand'"), 'Meshy ready-only slice should preserve mapped hand source keys');
assert(profiles.includes("boneRollCorrection: 'chain-up'"), 'Meshy wrist parity should retain chain-up bone-roll correction');
assert(profiles.includes("sourceRestClip: '0T-Pose'") && profiles.includes("targetRestProvider: 'skin-bind'"), 'Meshy wrist parity should not use stale animated model-node rest');
assert(!profiles.includes("pathMode: 'source-derived'"), 'failed live source-derived hand-delta path must remain inactive');
assert(!js.includes('position-guided-source-derived-hand-delta'), 'failed live source-derived metadata must not return');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-fps-upper-key-convert', 'authored-key-times', 'restored-weapongrip-frame-solve', 'direct-hand-fk-required'] }, null, 2));
