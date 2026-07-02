import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const socketSolver = fs.readFileSync(path.join(projectRoot, 'tools', 'socket_solver.mjs'), 'utf8');
const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }
const cacheToken = js.match(/const LAB_CACHE_TOKEN = '([^']+)'/)?.[1];

assert(js.includes('function collectSkinnedSkeletonBoneSet'), 'runtime should prefer bones from skinned skeletons when duplicate names exist');
assert(js.includes('function meaningfulBoneChild'), 'runtime should ignore same-name wrapper children for chain basis');
assert(js.includes('scoreNamedBoneCandidate'), 'runtime should score duplicate bone candidates deterministically');
assert(js.includes('const clipNames = new Set(options.clipNames || options.clips || [])'), 'mapped rotation retarget should support clip filtering');
assert(js.includes("const mappedTag = spec.clipTag || (spec.retargetMode === 'weapon-path-ik' ? 'SABRE' : 'MC')"), 'mapped retarget should support explicit clip tags including FPS-SWORD-UPPER');
assert(js.includes('function validateAutoRetargetGenerationGroups'), 'runtime should fail auto-retarget group collisions before generation');
assert(js.includes('generationGroup') && js.includes('shouldReplaceGeneratedClip(clip, generationGroup)'), 'generated clip replacement should use exact generation groups');
assert(!js.includes('startsWith(originPrefix)') && !js.includes('key.startsWith(originPrefix)'), 'generated clip replacement must not use broad prefix deletion');
assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'Meshy startup should use the accepted FPS/Meshy T-pose calibration');
assert(profiles.includes("sourceKey: 'player'"), 'Meshy generated clips should source from FPS Arms');
assert(profiles.includes("clipTag: 'FPS-SWORD-UPPER'"), 'Meshy generated clips should be tagged FPS-SWORD-UPPER');
assert(profiles.includes("clipTag: 'FPS-REST-ARMS-CAL'") && profiles.includes('restSegmentCorrection: meshyFpsRestSegmentCorrection(0)'), 'Meshy T-pose bridge should expose FPS rest-arms without pre-applying the old -120 hand-roll offset');
const restBlockStart = profiles.indexOf("clipTag: 'FPS-REST-ARMS-CAL'");
const restBlockEnd = profiles.indexOf('directRotationPairs: MESHY_FPS_REST_DIRECT_PAIRS', restBlockStart);
const restBlock = restBlockStart >= 0 && restBlockEnd > restBlockStart ? profiles.slice(restBlockStart, restBlockEnd) : '';
assert(restBlock && !restBlock.includes('weaponKeyConvert'), 'Meshy T-pose bridge must not generate WeaponR/WeaponGrip tracks for normal pure-FK clips');
assert(profiles.includes("parentMode: 'hand-fk'") && profiles.includes("syntheticSourceSocketBone: ''"), 'Meshy saber must use direct RightHand -> WeaponGrip pure FK');
assert(profiles.includes("RestProbe: ['0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', '0T-Pose -> meshyCharacter:FPS-REST-ARMS-CAL--120'"), 'Meshy RestProbe should default to the exact accepted CAL--120 clip path');
assert(profiles.includes("SwordReady: ['OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]'"), 'Meshy SwordReady should use the accepted golden OneHandReady record');
assert(profiles.includes("originPrefix: 'mapped-arms:player->meshyCharacter:FPS-VISUAL-IK-GOLDEN'"), 'Meshy golden ready clip should preserve a stable generated origin path');
assert(!profiles.includes("SwordReady: ['OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]'"), 'Meshy SwordReady must not point at the rejected ready retarget path during recovery');
assert(profiles.includes("originPrefix: 'mapped-arms:player->meshyCharacter:FPS-REST-ARMS-CAL--120'"), 'Meshy RestProbe clip should preserve the accepted CAL--120 origin path');
assert(!profiles.includes('defaultRestClip') && !js.includes('applyDefaultModelRestClip') && !js.includes('this.applyDefaultModelRestClips();'), 'accepted CAL--120 RestProbe must remain a generated clip, not mutate actor modelRestPose');
assert(!profiles.includes('...[-150') && !profiles.includes('FPS-REST-ARMS-CAL-120') && !profiles.includes('FPS-REST-ARMS-CAL-90') && !profiles.includes('FPS-REST-ARMS-CAL--90'), 'Meshy should not expose rejected positive or sweep hand-roll calibration clips after accepting CAL--120');
assert(profiles.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'") && profiles.includes("clipNames: [\n          'OneHandReady',\n        ]"), 'Meshy should keep only the accepted golden OneHandReady generator');
assert(profiles.includes('modelLocalOffset: [-0.03429, 0.04109, -0.07946]') && profiles.includes('gripLocalPosition: [0.6535, -0.02302, -0.07317]'), 'Meshy rig-local weapon placement must remain locked as repository truth');
assert(profiles.includes('modelLocalOffset: [0.00424, -0.0167, 0.01744]') && profiles.includes('gripLocalPosition: [0.67888, -0.07803, -0.06249]'), 'FPS manual weapon placement must remain locked as repository truth');
assert(!profiles.includes('worldJointProjectionSocketOrientation') && !js.includes('handDeltaWorld') && !js.includes('restRelative.socketWorldQuaternion'), 'Meshy visual IK must not install special socket orientation policies; manual attachment should keep its local hand-to-blade angle');
assert(socketSolver.includes('MANUAL_PLACEMENT_LOCK') && socketSolver.includes('promotable: false') && socketSolver.includes('productionSnippet: null') && socketSolver.includes('candidateModelLocalOffset: null'), 'socket diagnostics must not be able to promote or print production manual-placement overrides');
for (const deferred of ['OneHandReadied -> meshyCharacter', 'OneHandAttack1 -> meshyCharacter', 'OneHandAttack5 -> meshyCharacter', 'OneHandAirForwardAttack -> meshyCharacter']) {
  assert(!profiles.includes(deferred), `Meshy should defer generated attack/readied clip: ${deferred}`);
}
assert(profiles.includes("boneRollCorrection: 'chain-up'"), 'Meshy should use chain-up bone-roll correction');
assert(profiles.includes("mode: 'source-key-correction'") && profiles.includes('replaceTracks: false'), 'Meshy should use bounded IK correction without replacing authored source-key tracks');
assert(profiles.includes("sourceRestClip: '0T-Pose'") && profiles.includes("targetRestProvider: 'skin-bind'"), 'Meshy should retarget from explicit source and target rest providers');
assert(profiles.includes("{ from: 'Arm.R', to: 'RightArm', strength: 0.85 }"), 'Meshy should map source right upper arm to Meshy right upper arm');
assert(profiles.includes("{ from: 'Forearm.R', to: 'RightForeArm', strength: 1.0 }"), 'Meshy should map source right forearm to Meshy right forearm');
assert(!profiles.includes("clipTag: 'IB-MC'") && !profiles.includes("clipTag: 'RA-FULL'") && !profiles.includes("clipTag: 'GRIP'") && !profiles.includes("clipTag: 'CORE'"), 'Meshy should not generate rejected full-body or Scavenger clips');
assert(!profiles.includes("sourceKey: 'orc'") && !profiles.includes("sourceKey: 'ruinedAir'"), 'Meshy should not auto-retarget from Orc or Ruined Air after the FPS sword pivot');
assert(!profiles.includes('Armature|Swing1 -> meshyCharacter'), 'Meshy aliases should not preserve rejected Swing1 generated clips');
assert(cacheToken, 'runtime should declare a lab cache token');
assert(html.includes(`./src/rig-profiles.js?v=${cacheToken}`), 'HTML should load current rig profile token');
assert(html.includes(`./src/pose-lab.js?v=${cacheToken}`), 'HTML should load current runtime token');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['fps-sword-upper-core-retarget-contract', 'rejected-full-body-retargets-removed'] }, null, 2));
