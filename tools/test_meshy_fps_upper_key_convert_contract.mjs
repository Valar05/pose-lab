import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const glb = fs.readFileSync(path.join(projectRoot, 'assets', 'models', 'FPSPlayer.glb'));
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const readyStart = profiles.indexOf("retargetMode: 'meshy-fps-visual-ik-ready'");
const restStart = profiles.indexOf("retargetMode: 'fps-upper-key-convert'", readyStart);
const readyBlock = readyStart >= 0 && restStart > readyStart ? profiles.slice(readyStart, restStart) : '';

const start = js.indexOf('function buildFpsUpperKeyConvertClips');
const end = js.indexOf('function findBoneCanonical', start);
const fn = start >= 0 && end > start ? js.slice(start, end) : '';

assert(fn, 'runtime should retain buildFpsUpperKeyConvertClips for legacy/manual recovery diagnostics');
assert(fn.includes('let tracks = []'), 'legacy converter tracks must remain mutable for explicit generated sockets while preserving authored key tracks');
assert(fn.includes('sourceTrack.times.slice()'), 'legacy converter should copy source quaternion track times directly');
assert(fn.includes('clipRestQuaternionMap(sourceRestClip)') && fn.includes('skinnedBindLocalQuaternionMap(targetRoot)'), 'legacy converter should support explicit source clip rest and target skin-bind rest providers');
assert(fn.includes('const sourceRest = restQuaternionFor(sourceName, sourceBone, sourceRestMap)'), 'legacy converter direct path should still use the explicit FPS source rest clip');
assert(fn.includes('generatedHandRestLeakageMetrics(targetRoot, tracks, targetRestMap') && fn.includes('handRestLeakage'), 'legacy converter should keep generated hand rest leakage diagnostics measurable');
assert(fn.includes('options.absoluteSourcePose === true') && fn.includes('absoluteSourcePose: options.absoluteSourcePose === true'), 'legacy converter should support an absolute rest-pose diagnostic mode');
assert(fn.includes('sourceWeaponTrack.times.slice()'), 'legacy converter should preserve authored Weapon.R timing when manually invoked');
assert(fn.includes("ikMode === 'source-key-correction'") && fn.includes('solveTwoBoneIk(targetClone, upper, lower, hand, clampedTarget'), 'legacy converter should keep source-key correction available for diagnosis');
assert(fn.includes('quaternionFromBladeFrame(mappedBlade, mappedUp)') && fn.includes('weaponConfig.frameSolve !== false'), 'legacy converter should retain weapon-frame diagnostics for manual recovery');
assert(fn.includes('closeQuaternionLoopSeams(tracks)') && fn.includes('loopSeamClosed'), 'legacy converter should retain loop-seam diagnostics');
assert(!fn.includes('clipSampleTimes('), 'legacy converter must not create a uniform sampled timeline');
assert(!fn.includes('.optimize()'), 'legacy converter must not collapse or remove authored source keys');
assert(js.includes('preserveLoopSeam: spec.preserveLoopSeam === true'), 'auto retarget dispatcher should still pass preserveLoopSeam to the legacy converter when used');
assert(js.includes("spec.retargetMode === 'meshy-fps-visual-ik-ready'"), 'normal Meshy Ready dispatch should use the explicit Visual-IK Ready helper');

assert(readyBlock, 'Meshy Ready profile should include a Visual-IK Ready spec before the accepted rest calibration spec');
assert(readyBlock.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'Meshy Ready profile should generate the Visual-IK golden candidate');
assert(readyBlock.includes("clipNames: [\n          'OneHandReady',\n        ]"), 'Meshy Ready profile should generate only OneHandReady in this slice');
assert(readyBlock.includes('worldJointProjection: {') && readyBlock.includes("mode: 'world-joint-projection'") && readyBlock.includes('enabled: true'), 'active Meshy Ready profile should use constrained world-joint projection');
assert(readyBlock.includes('rightRollOffsetDeg: -120') && readyBlock.includes('leftRollOffsetDeg: -90'), 'active Meshy Ready profile should preserve accepted roll offsets');
assert(!readyBlock.includes("retargetMode: 'fps-upper-key-convert'"), 'normal Meshy Ready profile must not use the retired FPS upper source-key converter');
assert(!readyBlock.includes("clipTag: 'FPS-SWORD-UPPER'"), 'normal Meshy Ready profile must not generate the retired FPS-SWORD-UPPER clip');
assert(!readyBlock.includes('preserveLoopSeam: true'), 'normal Meshy Ready profile must not carry legacy loop-seam promotion flags');
assert(!readyBlock.includes('ikOrientationGuide: {') && !readyBlock.includes("mode: 'source-key-correction'"), 'active Ready profile must not use the retired source-key correction guide');
assert(!readyBlock.includes("staticCorrectionClips: ['OneHandReady']"), 'active Ready profile must not depend on retired static source-key correction clips');
assert(!readyBlock.includes("sourceWeapon: 'Weapon.R'") && !readyBlock.includes("targetWeapon: 'WeaponGrip'"), 'normal Ready candidate must not emit authored WeaponGrip tracks');
assert(!readyBlock.includes('weaponKeyConvert: {'), 'normal Ready candidate must not carry the old weapon conversion block');
assert(!profiles.includes("retargetMode: 'position-guided-arm',\n        clipTag: 'FPS-SWORD-UPPER'"), 'Meshy Ready must not dispatch sampled position-guided FPS-SWORD-UPPER IK');
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
console.log(JSON.stringify({ checked: ['legacy-fps-upper-converter-retained-for-diagnostics', 'active-profile-visual-ik-ready', 'no-active-weapon-grip-keying', 'onehandready-authored-31-key-source'] }, null, 2));
