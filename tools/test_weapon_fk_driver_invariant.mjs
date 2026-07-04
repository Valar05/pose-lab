import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const poseLabSource = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profilesSource = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const resolverSource = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab-profile-resolver.mjs'), 'utf8');

assert(!poseLabSource.includes('clipKey: context.clipKey'), 'weapon placement signature must not include active clip key');
assert(!poseLabSource.includes('restPose: context.restPose'), 'weapon placement signature must not include current rest pose');
assert(poseLabSource.includes('if (!force) return;'), 'runtime weapon sync must not rewrite boneRest every frame');

const restBlockStart = profilesSource.indexOf("clipTag: 'FPS-REST-ARMS-CAL'");
const restBlockEnd = profilesSource.indexOf('directRotationPairs: MESHY_FPS_REST_DIRECT_PAIRS', restBlockStart);
const restBlock = restBlockStart >= 0 && restBlockEnd > restBlockStart ? profilesSource.slice(restBlockStart, restBlockEnd) : '';
assert(restBlock && !restBlock.includes('weaponKeyConvert'), 'T-pose rest bridge must not generate Meshy weapon tracks for the accepted baseline');

const swordBlockStart = profilesSource.indexOf("clipTag: 'FPS-SWORD-UPPER'");
const swordBlockEnd = profilesSource.indexOf('ikOrientationGuide:', swordBlockStart);
const swordBlock = swordBlockStart >= 0 && swordBlockEnd > swordBlockStart ? profilesSource.slice(swordBlockStart, swordBlockEnd) : '';
assert(swordBlock.includes("originPrefix: 'mapped-arms:player->meshyCharacter:FPS-SWORD-UPPER'"), 'FPS-SWORD-UPPER should use the restored exact mapped-arms origin group');
assert(swordBlock.includes("sourceWeapon: 'Weapon.R'") && swordBlock.includes("targetWeapon: 'WeaponGrip'"), 'FPS-SWORD-UPPER should keep the restored source Weapon.R -> WeaponGrip bridge');
assert(swordBlock.includes('frameSolve: true') && swordBlock.includes('applyToHand: false'), 'restored weapon bridge should solve the weapon frame without rewriting the hand track');
assert(profilesSource.includes("positionMode: 'right-hand'"), 'Meshy weapon proxy should declare right-hand FK ownership');
assert(poseLabSource.includes("else if (handFk || root.userData.positionMode === 'right-hand') rightHand.add(root);"), 'right-hand weapon proxy mode must parent WeaponGrip under RightHand even when leftHandBone exists');
assert(poseLabSource.includes('else if (leftHand) this.model.add(root);'), 'model-level weapon parenting should remain only for non-right-hand two-hand modes');
const weaponRuntimeSource = fs.readFileSync(path.join(projectRoot, 'src', 'weapon-runtime-rules.mjs'), 'utf8');
assert(weaponRuntimeSource.includes("if ((config.positionMode || '') === 'right-hand' && proxy.root.parent === proxy.rightHand)"), 'right-hand weapon mode should use boring local FK under RightHand');
assert(weaponRuntimeSource.includes("mode: 'right-hand-fk'"), 'right-hand FK branch should report its runtime mode');
assert(weaponRuntimeSource.includes('const rootUnderRigBone = Boolean(rootParent && rootParent !== actorModel);'), 'weapon display scale compensation must detect rig-bone parenting');
assert(weaponRuntimeSource.includes('1 / Math.max(0.000001, Math.abs(socketWorldScale.x))'), 'weapon displayRoot should cancel inherited socket scale for right-hand FK parenting');

assert(!profilesSource.includes("parentMode: 'hand-fk'"), 'Meshy production profile must not use the failed direct hand-fk override');
assert(!profilesSource.includes("syntheticSourceSocketBone: ''"), 'Meshy production profile must not force an empty synthetic socket');
assert(!profilesSource.includes("placementAuthority: 'manual-golden'"), 'Meshy production profile must not keep the failed manual-golden authority label');
assert(!profilesSource.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'failed Visual-IK Ready generator must not remain promoted');
assert(resolverSource.includes("parentMode: typeof proxy.parentMode === 'string' ? proxy.parentMode : ''"), 'profile resolver should preserve legacy/no-parentMode Meshy profiles');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: 'restored-weapon-driver-invariant',
  restoredSwordBridge: true,
  failedHandFkPromotionAbsent: true,
}, null, 2));
