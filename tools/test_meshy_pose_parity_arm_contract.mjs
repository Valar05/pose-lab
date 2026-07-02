import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const weaponRuntimeRules = fs.readFileSync(path.join(projectRoot, 'src', 'weapon-runtime-rules.mjs'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes('function buildFpsUpperKeyConvertClips'), 'Meshy sword clips should use the FPS upper source-key converter');
assert(js.includes("mode: 'fps-upper-key-convert source-authored-times"), 'converted Meshy sword clips should identify source-authored key conversion');
assert(js.includes("ikMode === 'source-key-correction'") && js.includes('ikPreservesSourceTracks'), 'converter should support IK-guided correction without replacing source tracks');
assert(js.includes('quaternionFromBladeFrame(mappedBlade, mappedUp)') && js.includes('weaponFrameSolve'), 'converter should keep measured WeaponGrip frame solve metadata for opt-in diagnostics');
assert(js.includes('const weaponTrackEnabled = weaponConfig.enabled === true && weaponConfig.experimentalWeaponSwing === true') && js.includes('if (weaponTrackEnabled && sourceWeaponTrack)'), 'active converter should key weapon sockets only for explicit experimental weapon swings');
assert(js.includes('sourceWeaponTrack.times.slice()'), 'deprecated experimental Weapon.R diagnostics should preserve authored source key times');
assert(!profiles.includes("retargetMode: 'position-guided-arm',\n        clipTag: 'FPS-SWORD-UPPER'"), 'accepted Meshy FPS-SWORD-UPPER path must not use sampled position-guided IK');
assert(!profiles.includes('copiedSourceLayer') && !js.includes('syncCopiedSourceLayer'), 'Meshy ready review should not create a copied FPS actor overlay');
assert(profiles.includes("parentMode: 'hand-fk'") && profiles.includes("syntheticSourceSocketBone: ''") && js.includes('else if (handFk) rightHand.add(root);'), 'Meshy WeaponGrip should be a direct pure-FK child of RightHand');
assert(weaponRuntimeRules.includes('proxy.root.quaternion.copy(proxy.fkLocalQuaternion);') && weaponRuntimeRules.includes('socketQuaternionInHand'), 'WeaponGrip should restore cached local position/quaternion under RightHand every frame');

assert(profiles.includes("retargetMode: 'fps-upper-key-convert'"), 'Meshy FPS-SWORD-UPPER config should use source-key conversion');
assert(profiles.includes('ikOrientationGuide: {') && profiles.includes("mode: 'source-key-correction'") && profiles.includes('replaceTracks: false'), 'Meshy FPS-SWORD-UPPER ready profile should use IK only as bounded source-key correction');
assert(!profiles.includes('weaponKeyConvert'), 'Meshy normal generated clips must not generate WeaponR/WeaponGrip tracks');
assert(js.includes('if (guidedTracks.length && !ikPreservesSourceTracks)'), 'replacement IK should be guarded away from the active source-key correction mode');
assert(profiles.includes("positionMode: 'right-hand'"), 'Meshy one-hand saber socket should be positioned on the right hand, not the two-hand midpoint');
assert(profiles.includes("parentMode: 'hand-fk'"), 'Meshy one-hand saber socket should follow RightHand through direct FK');
assert(!profiles.includes("targetWeapon: 'WeaponR'") && !profiles.includes("targetWeapon: 'WeaponGrip'"), 'Meshy normal clips should not map authored Weapon.R onto runtime weapon tracks');
assert(profiles.includes("from: 'Hand.L', to: 'LeftHand'") && profiles.includes("from: 'Hand.R', to: 'RightHand'"), 'Meshy ready-only slice should preserve mapped hand source keys');
assert(profiles.includes("boneRollCorrection: 'chain-up'"), 'Meshy wrist parity should retain chain-up bone-roll correction');
assert(profiles.includes("sourceRestClip: '0T-Pose'") && profiles.includes("targetRestProvider: 'skin-bind'"), 'Meshy wrist parity should not use stale animated model-node rest');
assert(!profiles.includes("pathMode: 'source-derived'"), 'failed live source-derived hand-delta path must remain inactive');
assert(!js.includes('position-guided-source-derived-hand-delta'), 'failed live source-derived metadata must not return');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-fps-upper-key-convert', 'authored-key-times', 'pure-fk-weapon-grip', 'normal-weapon-tracks-absent'] }, null, 2));
