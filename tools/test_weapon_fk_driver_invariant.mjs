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

const swordClipTag = profilesSource.indexOf("clipTag: 'FPS-SWORD-UPPER'");
const swordBlockStart = swordClipTag >= 0 ? profilesSource.lastIndexOf('      {', swordClipTag) : -1;
const swordBlockEnd = profilesSource.indexOf("clipTag: 'FPS-REST-ARMS-CAL'", swordClipTag);
const swordBlock = swordBlockStart >= 0 && swordBlockEnd > swordBlockStart ? profilesSource.slice(swordBlockStart, swordBlockEnd) : '';
assert(swordBlock.includes("originPrefix: 'mapped-arms:player->meshyCharacter'"), 'FPS-SWORD-UPPER should use the restored mapped-arms origin group');
assert(swordBlock.includes("retargetMode: 'world-joint-projection'"), 'FPS-SWORD-UPPER should use the world-joint Ready pose generator instead of the red direct quaternion copy');
assert(swordBlock.includes("sourceUpper: 'Arm.R'") && swordBlock.includes("targetUpper: 'RightArm'"), 'FPS-SWORD-UPPER should solve the right arm from authored FPS world joints');
assert(!swordBlock.includes('weaponKeyConvert'), 'FPS-SWORD-UPPER must not key WeaponGrip; direct hand FK owns the weapon at runtime');
assert(profilesSource.includes('clipOverrides: [') && profilesSource.includes("clipPattern: 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]'"), 'Ready hilt anchor adjustment must be clip-scoped, not a global T-pose attachment edit');
assert(poseLabSource.includes('clipScopedWeaponAttachmentConfig') && poseLabSource.includes('applyWeaponAttachmentRuntimeRules(THREE, { actorModel: this.model, proxy, config: effectiveConfig })'), 'runtime should apply Ready-only attachment overrides through the active clip');

assert(profilesSource.includes("parentMode: 'hand-fk'"), 'Meshy production profile must use direct hand-fk so hosted Firebase can prove boring FK');
assert(!profilesSource.includes("syntheticSourceSocketBone: ''"), 'Meshy production profile must not force an empty synthetic socket');
assert(!profilesSource.includes("placementAuthority: 'manual-golden'"), 'Meshy production profile must not keep the failed manual-golden authority label');
assert(!profilesSource.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'failed Visual-IK Ready generator must not remain promoted');
assert(resolverSource.includes("parentMode: typeof proxy.parentMode === 'string' ? proxy.parentMode : ''"), 'profile resolver should preserve legacy/no-parentMode Meshy profiles');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: 'restored-weapon-driver-invariant',
  restoredSwordBridge: true,
  directHandFkRequired: true,
}, null, 2));
