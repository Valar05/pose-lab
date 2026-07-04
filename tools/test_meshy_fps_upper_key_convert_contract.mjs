import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const readyRuntime = fs.readFileSync(path.join(projectRoot, 'src', 'meshy-ready-runtime.mjs'), 'utf8');
const glb = fs.readFileSync(path.join(projectRoot, 'assets', 'models', 'FPSPlayer.glb'));
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const start = js.indexOf('function buildFpsUpperKeyConvertClips');
const end = js.indexOf('function findBoneCanonical', start);
const fn = start >= 0 && end > start ? js.slice(start, end) : '';

assert(fn, 'runtime should keep buildFpsUpperKeyConvertClips for non-golden diagnostics');
assert(fn.includes('let tracks = []'), 'converter tracks must be mutable for explicit generated sockets while preserving authored key tracks');
assert(fn.includes('sourceTrack.times.slice()'), 'converter should copy source quaternion track times directly');
assert(fn.includes('clipRestQuaternionMap(sourceRestClip)') && fn.includes('skinnedBindLocalQuaternionMap(targetRoot)'), 'converter should support explicit source clip rest and target skin-bind rest providers');
assert(fn.includes('const sourceRest = restQuaternionFor(sourceName, sourceBone, sourceRestMap)'), 'converter direct path should actually use the explicit FPS source rest clip');
assert(fn.includes('generatedHandRestLeakageMetrics(targetRoot, tracks, targetRestMap') && fn.includes('handRestLeakage'), 'converter should report generated hand rest leakage so bind-pose regressions are measurable');
assert(fn.includes('options.absoluteSourcePose === true') && fn.includes('absoluteSourcePose: options.absoluteSourcePose === true'), 'converter should support an absolute rest-pose diagnostic mode');
assert(fn.includes('sourceWeaponTrack.times.slice()'), 'converter should copy authored Weapon.R times directly when used diagnostically');
assert(fn.includes("ikMode === 'source-key-correction'") && fn.includes('solveTwoBoneIk(targetClone, upper, lower, hand, clampedTarget'), 'converter should retain source-key IK correction capability for diagnostics');
assert(fn.includes('quaternionFromBladeFrame(mappedBlade, mappedUp)') && fn.includes('weaponConfig.frameSolve !== false'), 'converter should retain WeaponGrip frame-solve capability for diagnostics');
assert(fn.includes('closeQuaternionLoopSeams(tracks)') && fn.includes('loopSeamClosed'), 'converter should close generated quaternion seams while preserving source authored looping when requested');
assert(!fn.includes('clipSampleTimes('), 'accepted converter utility must not create a uniform sampled timeline');
assert(!fn.includes('.optimize()'), 'accepted converter utility must not collapse or remove authored source keys');

assert(profiles.includes("retargetMode: 'meshy-fps-visual-ik-ready'"), 'active Meshy Ready profile should use the golden visual IK helper');
assert(profiles.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'active Meshy Ready profile should keep the golden clip tag');
assert(profiles.includes("clipSuffix: '-> meshyCharacter [FPS-VISUAL-IK R0 L-90]'"), 'active Meshy Ready profile should keep the neutral-right clip label');
assert(profiles.includes('rightRollOffsetDeg: 0') && profiles.includes('leftRollOffsetDeg: -90'), 'active Meshy Ready profile should keep right roll neutral and preserve left roll');
assert(profiles.includes("sourceRestClip: '0T-Pose'") && profiles.includes("targetRestProvider: 'skin-bind'"), 'Meshy Ready should translate from FPS 0T-Pose rest into Meshy skin-bind rest');
assert(profiles.includes("clipTag: 'FPS-REST-ARMS-CAL'") && profiles.includes('restSegmentCorrection: meshyFpsRestSegmentCorrection(0)'), 'Meshy should keep the FPS arm rest-pose calibration right-hand roll neutral');
assert(profiles.includes("RestProbe: ['0T-Pose -> meshyCharacter [FPS-REST-ARMS no right roll]', '0T-Pose -> meshyCharacter:FPS-REST-ARMS-CAL-0'"), 'Meshy RestProbe should select the exact accepted neutral T-pose clip');
assert(profiles.includes("originPrefix: 'mapped-arms:player->meshyCharacter:FPS-REST-ARMS-CAL-0'"), 'Meshy RestProbe generated label should preserve the neutral origin path');
assert(!profiles.includes('...[-150') && !profiles.includes('FPS-REST-ARMS-CAL-120') && !profiles.includes('FPS-REST-ARMS-CAL-90') && !profiles.includes('FPS-REST-ARMS-CAL--90'), 'Meshy should not generate rejected positive or sweep FPS arm rest-pose hand-roll clips');
assert(js.includes('preserveLoopSeam: spec.preserveLoopSeam === true'), 'auto retarget dispatcher should still pass preserveLoopSeam into the generic converter');
assert(profiles.includes("clipNames: [\n          'OneHandReady',\n        ]"), 'Meshy Ready should generate only OneHandReady in this slice');
assert(!profiles.includes("targetWeapon: 'WeaponGrip'") && !profiles.includes("sourceWeapon: 'Weapon.R'"), 'active Meshy Ready must not key WeaponGrip from FPS Weapon.R');
assert(readyRuntime.includes('weaponConfig.enabled === true && weaponConfig.experimentalWeaponSwing === true'), 'golden Ready helper should keep weapon tracks inert unless explicitly experimental');
assert(!profiles.includes("retargetMode: 'position-guided-arm',\n        clipTag: 'FPS-SWORD-UPPER'"), 'Meshy Ready must not dispatch sampled position-guided IK');
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
console.log(JSON.stringify({
  checked: [
    'generic-fps-upper-key-convert-still-diagnostic',
    'active-profile-golden-visual-ik-ready',
    'no-normal-weapon-tracks',
    'onehandready-authored-31-key-source',
  ],
}, null, 2));
