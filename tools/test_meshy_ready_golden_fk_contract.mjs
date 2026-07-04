import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const poseLab = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const readyRuntime = fs.readFileSync(path.join(projectRoot, 'src', 'meshy-ready-runtime.mjs'), 'utf8');

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

for (const literal of [
  "startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }",
  "handLocalOffset: [0.095, 0.035, -0.01]",
  "modelLocalOffset: [-0.11512, 0.00773, -0.01127]",
  "rotationDeg: [90, 0, -55.145]",
  "gripLocalPosition: [0.6535, -0.02302, -0.07317]",
  "tipLocalPosition: [-0.95561, 0.1368, 0]",
]) {
  assert(profiles.includes(literal), `protected T-pose/manual weapon literal changed: ${literal}`);
}

assert(profiles.includes("SwordReady: ['0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', '0T-Pose -> meshyCharacter:FPS-REST-ARMS-CAL--120', '0T-Pose']"), 'SwordReady should stay on accepted T-pose aliases until Ready has fresh promotion evidence');
assert(profiles.includes("visibleClipPatterns: ['\\\\[FPS-REST-ARMS']"), 'weapon visibility should stay on accepted T-pose rest patterns until Ready has fresh promotion evidence');
assert(profiles.includes("retargetMode: 'meshy-fps-visual-ik-ready'"), 'Meshy Ready should use the explicit golden Ready helper mode');
assert(profiles.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'Meshy Ready candidate generator should keep the reviewable clip tag');
assert(profiles.includes("clipSuffix: '-> meshyCharacter [FPS-VISUAL-IK R-120 L-90]'"), 'Meshy Ready candidate generator should keep the reviewable visual IK label');
assert(profiles.includes("originPrefix: 'mapped-arms:player->meshyCharacter:FPS-VISUAL-IK-GOLDEN'"), 'Meshy Ready candidate generator should keep the generated-group identity');
assert(profiles.includes('rightRollOffsetDeg: 0'), 'Meshy Ready should preserve the current right hand roll');
assert(profiles.includes('leftRollOffsetDeg: -90'), 'Meshy Ready should preserve left hand roll -90');
assert(!profiles.includes("clipTag: 'FPS-SWORD-UPPER'"), 'Meshy Ready should not keep the rejected FPS-SWORD-UPPER generator');
assert(!profiles.includes("targetWeapon: 'WeaponGrip'"), 'Meshy Ready should not generate normal WeaponGrip tracks from FPS Weapon.R');
assert(!profiles.includes("sourceWeapon: 'Weapon.R'"), 'Meshy Ready should not accept FPS Weapon.R as runtime weapon authority');

assert(poseLab.includes("import { buildMeshyFpsVisualIkReadyClip }"), 'pose-lab should import the golden Ready helper');
assert(poseLab.includes("spec.retargetMode === 'meshy-fps-visual-ik-ready'"), 'pose-lab should dispatch the golden Ready helper mode');
assert(poseLab.includes("weaponAttachment: target.info?.weaponAttachment || {}"), 'Ready helper should receive attachment metadata without enabling normal weapon tracks');

assert(readyRuntime.includes('export function buildMeshyFpsVisualIkReadyClip'), 'Ready runtime helper should export buildMeshyFpsVisualIkReadyClip');
assert(readyRuntime.includes("origin: 'offline-shared-meshy-ready-runtime'"), 'Ready helper should mark clips with shared runtime provenance');
assert(readyRuntime.includes("mode: 'world-joint-projection source-authored-times'"), 'Ready helper should mark clips as source-authored world-joint projection');
assert(readyRuntime.includes('worldJointProjection: true'), 'Ready helper should identify world-joint projection output');
assert(readyRuntime.includes('droppedInitialRestKey'), 'Ready helper should preserve source-authored timing metadata');
assert(readyRuntime.includes('weaponTrackEnabled: Boolean(weaponTrack)'), 'Ready helper should expose whether experimental weapon tracks were emitted');
assert(readyRuntime.includes('rightRollOffsetDeg: 0'), 'Ready helper should lock the current right roll');
assert(readyRuntime.includes('leftRollOffsetDeg: -90'), 'Ready helper should lock left roll -90');
assert(readyRuntime.includes('weaponConfig.enabled === true && weaponConfig.experimentalWeaponSwing === true'), 'Ready helper should keep weapon tracks inert unless explicitly experimental');

if (failures.length) {
  throw new Error(failures.join('\n'));
}

console.log(JSON.stringify({
  checked: [
    'tpose-canary-literals',
    'candidate-ready-roll-split',
    'no-normal-weapon-tracks',
    'ready-helper-dispatch',
  ],
}, null, 2));
