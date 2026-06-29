import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const glb = fs.readFileSync(path.join(projectRoot, 'assets', 'models', 'FPSPlayer.glb'));
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const start = js.indexOf('function buildFpsUpperKeyConvertClips');
const end = js.indexOf('function findBoneCanonical', start);
const fn = start >= 0 && end > start ? js.slice(start, end) : '';

assert(fn, 'runtime should define buildFpsUpperKeyConvertClips');
assert(fn.includes('let tracks = []'), 'converter tracks must be mutable for explicit generated sockets while preserving authored key tracks');
assert(fn.includes('sourceTrack.times.slice()'), 'converter should copy source quaternion track times directly');
assert(fn.includes('clipRestQuaternionMap(sourceRestClip)') && fn.includes('skinnedBindLocalQuaternionMap(targetRoot)'), 'converter should support explicit source clip rest and target skin-bind rest providers');
assert(fn.includes('const sourceRest = restQuaternionFor(sourceName, sourceBone, sourceRestMap)'), 'converter direct path should actually use the explicit FPS source rest clip');
assert(fn.includes('generatedHandRestLeakageMetrics(targetRoot, tracks, targetRestMap') && fn.includes('handRestLeakage'), 'converter should report generated hand rest leakage so bind-pose regressions are measurable');
assert(fn.includes('options.absoluteSourcePose === true') && fn.includes('absoluteSourcePose: options.absoluteSourcePose === true'), 'converter should support an absolute rest-pose diagnostic mode');
assert(fn.includes('sourceWeaponTrack.times.slice()'), 'converter should copy authored Weapon.R times directly');
assert(fn.includes("ikMode === 'source-key-correction'") && fn.includes('solveTwoBoneIk(targetClone, upper, lower, hand, clampedTarget'), 'converter should use IK as a source-key correction layer');
assert(fn.includes('quaternionFromBladeFrame(mappedBlade, mappedUp)') && fn.includes('weaponConfig.frameSolve !== false'), 'converter should solve WeaponGrip from mapped source blade/up frame instead of raw wrist-relative rotation');
assert(fn.includes('closeQuaternionLoopSeams(tracks)') && fn.includes('loopSeamClosed'), 'converter should close generated quaternion seams while preserving source authored looping');
assert(!fn.includes('clipSampleTimes('), 'accepted converter must not create a uniform sampled timeline');
assert(!fn.includes('.optimize()'), 'accepted converter must not collapse or remove authored source keys');
assert(profiles.includes("retargetMode: 'fps-upper-key-convert'"), 'Meshy profile should use the accepted converter');
assert(profiles.includes('preserveLoopSeam: true'), 'Meshy FPS-SWORD-UPPER clips should preserve the authored cyclic return instead of clamping playback');
assert(profiles.includes("sourceRestClip: '0T-Pose'") && profiles.includes("targetRestProvider: 'skin-bind'"), 'Meshy FPS-SWORD-UPPER should translate from FPS 0T-Pose rest into Meshy skin-bind rest');
assert(profiles.includes("clipTag: 'FPS-REST-ARMS-CAL'") && profiles.includes('restSegmentCorrection: meshyFpsRestSegmentCorrection(-120)'), 'Meshy should generate the accepted FPS arm rest-pose CAL--120 clip');
assert(profiles.includes("RestProbe: ['0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', '0T-Pose -> meshyCharacter:FPS-REST-ARMS-CAL--120'"), 'Meshy RestProbe should select the exact accepted CAL--120 T-pose clip');
assert(profiles.includes("originPrefix: 'mapped-arms:player->meshyCharacter:FPS-REST-ARMS-CAL--120'"), 'Meshy RestProbe generated label should preserve the accepted CAL--120 origin path');
assert(!profiles.includes('...[-150') && !profiles.includes('FPS-REST-ARMS-CAL-120') && !profiles.includes('FPS-REST-ARMS-CAL-90') && !profiles.includes('FPS-REST-ARMS-CAL--90'), 'Meshy should not generate rejected positive or sweep FPS arm rest-pose hand-roll clips');
assert(js.includes('preserveLoopSeam: spec.preserveLoopSeam === true'), 'auto retarget dispatcher should pass preserveLoopSeam into the converter');
assert(profiles.includes("clipNames: [\n          'OneHandReady',\n        ]"), 'Meshy FPS-SWORD-UPPER should generate only OneHandReady in this slice');
assert(profiles.includes('ikOrientationGuide: {') && profiles.includes("mode: 'source-key-correction'") && profiles.includes('replaceTracks: false'), 'active Meshy ready profile should use IK only as source-key correction');
assert(profiles.includes("from: 'Hand.L', to: 'LeftHand'") && profiles.includes("from: 'Hand.R', to: 'RightHand'"), 'ready-only target should preserve mapped source hand keys');
assert(profiles.includes('frameSolve: true') && profiles.includes('applyToHand: false'), 'Meshy profile should solve WeaponGrip without overriding the authored wrist');
assert(fn.includes('if (guidedTracks.length && !ikPreservesSourceTracks)') && fn.includes('ikCorrectedTrackCount'), 'source-key IK mode should correct existing tracks instead of replacing them');
assert(profiles.includes("staticCorrectionClips: ['OneHandReady']"), 'held OneHandReady should use stable IK correction to avoid per-key twitch');
assert(!profiles.includes("retargetMode: 'position-guided-arm',\n        clipTag: 'FPS-SWORD-UPPER'"), 'Meshy FPS-SWORD-UPPER must not dispatch sampled position-guided IK');
assert(!js.includes('LoopOnce'), 'Meshy sword fix should not clamp authored looping clips to LoopOnce');

const jsonLength = glb.readUInt32LE(12);
const json = JSON.parse(glb.slice(20, 20 + jsonLength).toString('utf8'));
const accessors = json.accessors || [];
const nodes = json.nodes || [];
const clip = (json.animations || []).find((entry) => entry.name === 'OneHandReady');
assert(clip, 'FPSPlayer.glb should contain OneHandReady');
for (const targetName of ['Arm.R', 'Forearm.R', 'Hand.R', 'Weapon.R']) {
  const channel = (clip?.channels || []).find((entry) => nodes[entry.target.node]?.name === targetName && entry.target.path === 'rotation');
  const sampler = channel ? clip.samplers[channel.sampler] : null;
  const inputAccessor = sampler ? accessors[sampler.input] : null;
  assert(inputAccessor?.count === 31, `OneHandReady ${targetName}.rotation should have 31 authored keys, got ${inputAccessor?.count || 'missing'}`);
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['fps-upper-key-convert-no-invented-frames', 'active-profile-source-key-ik-correction', 'weapon-frame-solve', 'loop-seam-preserved', 'onehandready-authored-31-key-source'] }, null, 2));
