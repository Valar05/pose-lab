import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes('function collectSkinnedSkeletonBoneSet'), 'runtime should prefer bones from skinned skeletons when duplicate names exist');
assert(js.includes('function meaningfulBoneChild'), 'runtime should ignore same-name wrapper children for chain basis');
assert(js.includes('scoreNamedBoneCandidate'), 'runtime should score duplicate bone candidates deterministically');
assert(js.includes('const clipNames = new Set(options.clipNames || options.clips || [])'), 'mapped rotation retarget should support clip filtering');
assert(js.includes("const mappedTag = spec.clipTag || (spec.retargetMode === 'weapon-path-ik' ? 'SABRE' : 'MC')"), 'mapped retarget should support explicit clip tags including FPS-SWORD-UPPER');
assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'Meshy startup should use the accepted FPS/Meshy T-pose calibration');
assert(profiles.includes("sourceKey: 'player'"), 'Meshy generated clips should source from FPS Arms');
assert(profiles.includes("clipTag: 'FPS-SWORD-UPPER'"), 'Meshy generated clips should be tagged FPS-SWORD-UPPER');
assert(profiles.includes("clipTag: 'FPS-REST-ARMS-CAL'") && profiles.includes('restSegmentCorrection: meshyFpsRestSegmentCorrection(-120)'), 'Meshy should expose the accepted FPS rest-arms CAL--120 clip');
assert(profiles.includes("RestProbe: ['0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', '0T-Pose -> meshyCharacter:FPS-REST-ARMS-CAL--120'"), 'Meshy RestProbe should default to the exact accepted CAL--120 clip path');
assert(profiles.includes("SwordReady: ['0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]'"), 'Meshy SwordReady should not promote a failed ready candidate before artifact acceptance');
assert(!profiles.includes("SwordReady: ['OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]'"), 'Meshy SwordReady must not point at the rejected ready retarget path during recovery');
assert(profiles.includes("originPrefix: 'mapped-arms:player->meshyCharacter:FPS-REST-ARMS-CAL--120'"), 'Meshy RestProbe clip should preserve the accepted CAL--120 origin path');
assert(!profiles.includes('defaultRestClip') && !js.includes('applyDefaultModelRestClip') && !js.includes('this.applyDefaultModelRestClips();'), 'accepted CAL--120 RestProbe must remain a generated clip, not mutate actor modelRestPose');
assert(!profiles.includes('...[-150') && !profiles.includes('FPS-REST-ARMS-CAL-120') && !profiles.includes('FPS-REST-ARMS-CAL-90') && !profiles.includes('FPS-REST-ARMS-CAL--90'), 'Meshy should not expose rejected positive or sweep hand-roll calibration clips after accepting CAL--120');
assert(profiles.includes("clipNames: [\n          'OneHandReady',\n        ]"), 'Meshy keeps the old FPS OneHandReady generator only as an unpromoted source path during recovery');
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
assert(html.includes('./src/rig-profiles.js?v=pose-editor-115'), 'HTML should load current rig profile token');
assert(html.includes('./src/pose-lab.js?v=pose-editor-115'), 'HTML should load current runtime token');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['fps-sword-upper-core-retarget-contract', 'rejected-full-body-retargets-removed'] }, null, 2));
