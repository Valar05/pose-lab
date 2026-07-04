import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes('function buildFpsUpperKeyConvertClips'), 'runtime may keep the FPS upper source-key converter for diagnostics');
assert(js.includes("mode: 'fps-upper-key-convert source-authored-times"), 'diagnostic converted clips should identify source-authored key conversion');
assert(js.includes("ikMode === 'source-key-correction'") && js.includes('ikPreservesSourceTracks'), 'converter should retain IK-guided correction without replacing source tracks');
assert(js.includes('quaternionFromBladeFrame(mappedBlade, mappedUp)') && js.includes('weaponFrameSolve'), 'converter should retain measured WeaponGrip frame solve metadata for diagnostics');
assert(js.includes('sourceWeaponRelativeToWrist') && js.includes("new THREE.QuaternionKeyframeTrack(targetWeaponName + '.quaternion'"), 'diagnostic converter can still key WeaponGrip from Weapon.R relative to Hand.R');
assert(js.includes('sourceWeaponTrack.times.slice()'), 'diagnostic WeaponGrip conversion should preserve authored Weapon.R key times');
assert(!profiles.includes("retargetMode: 'position-guided-arm',\n        clipTag: 'FPS-SWORD-UPPER'"), 'accepted Meshy FPS-SWORD-UPPER path must not use sampled position-guided IK');
assert(js.includes('clipHasQuaternionTrackForBone(this.activeAction?._clip, proxy.root.name)'), 'weapon socket updater should detect animated WeaponGrip quaternion tracks');
assert(js.includes('if (!animatedSocketRotation)') && js.includes('proxy.root.quaternion.copy(modelWorldQuat.multiply(worldQuaternionOf(proxy.rightHand))).normalize()'), 'two-hand socket update should preserve animated socket rotation when present');

assert(profiles.includes("retargetMode: 'meshy-fps-visual-ik-ready'"), 'Meshy Ready config should use the golden visual IK helper');
assert(profiles.includes("mode: 'world-joint-projection'") && profiles.includes('restRelative: true'), 'Meshy Ready should use rest-relative world-joint projection');
assert(profiles.includes('rightRollOffsetDeg: -120') && profiles.includes('leftRollOffsetDeg: -90'), 'Meshy Ready should keep the accepted roll split');
assert(!profiles.includes("sourceWeapon: 'Weapon.R'") && !profiles.includes("targetWeapon: 'WeaponGrip'"), 'active Meshy Ready should not generate WeaponGrip tracks from FPS Weapon.R');
assert(js.includes('if (guidedTracks.length && !ikPreservesSourceTracks)'), 'replacement IK should be guarded away from the active source-key correction mode');
assert(profiles.includes("positionMode: 'right-hand'"), 'Meshy one-hand saber socket should be positioned on the right hand, not the two-hand midpoint');
assert(profiles.includes("handBone: 'RightHand'") && profiles.includes("socketBone: 'WeaponGrip'"), 'Meshy right-hand weapon socket should remain configured on RightHand and WeaponGrip');
assert(profiles.includes("from: 'Hand.L', to: 'LeftHand'") && profiles.includes("from: 'Hand.R', to: 'RightHand'"), 'Meshy rest calibration should preserve mapped hand source keys');
assert(profiles.includes("sourceRestClip: '0T-Pose'") && profiles.includes("targetRestProvider: 'skin-bind'"), 'Meshy wrist parity should not use stale animated model-node rest');
assert(!profiles.includes("pathMode: 'source-derived'"), 'failed live source-derived hand-delta path must remain inactive');
assert(!js.includes('position-guided-source-derived-hand-delta'), 'failed live source-derived metadata must not return');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-fps-upper-key-convert', 'authored-key-times', 'weapongrip-frame-solve', 'animated-socket-preserved'] }, null, 2));
