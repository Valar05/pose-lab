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
assert(js.includes("spec.retargetMode === 'meshy-fps-visual-ik-ready'"), 'mapped retarget should support the explicit Meshy Visual IK Ready pose mode');
assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'Meshy startup should keep the accepted FPS/Meshy T-pose calibration');
assert(profiles.includes("sourceKey: 'player'"), 'Meshy generated clips should source from FPS Arms');
assert(profiles.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'Meshy Ready generated clip should be tagged FPS-VISUAL-IK-GOLDEN');
assert(profiles.includes("clipTag: 'FPS-REST-ARMS-CAL'") && profiles.includes('restSegmentCorrection: meshyFpsRestSegmentCorrection(-120)'), 'Meshy should expose the accepted FPS rest-arms CAL--120 clip');
assert(profiles.includes("RestProbe: ['0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', '0T-Pose -> meshyCharacter:FPS-REST-ARMS-CAL--120'"), 'Meshy RestProbe should default to the exact accepted CAL--120 clip path');
assert(profiles.includes("SwordReady: ['0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]'"), 'Meshy SwordReady should stay on the accepted FPS/Meshy T-pose calibration');
assert(!profiles.includes("SwordReady: ['OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]'"), 'Meshy SwordReady must not promote the visual IK ready candidate');
assert(!profiles.includes("SwordReady: ['OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]'"), 'Meshy SwordReady must not point at the rejected FPS-SWORD-UPPER retarget path');
assert(profiles.includes("originPrefix: 'mapped-arms:player->meshyCharacter:FPS-REST-ARMS-CAL--120'"), 'Meshy RestProbe clip should preserve the accepted CAL--120 origin path');
assert(!profiles.includes('defaultRestClip') && !js.includes('applyDefaultModelRestClip') && !js.includes('this.applyDefaultModelRestClips();'), 'accepted CAL--120 RestProbe must remain a generated clip, not mutate actor modelRestPose');
assert(!profiles.includes('...[-150') && !profiles.includes('FPS-REST-ARMS-CAL-120') && !profiles.includes('FPS-REST-ARMS-CAL-90') && !profiles.includes('FPS-REST-ARMS-CAL--90'), 'Meshy should not expose rejected positive or sweep hand-roll calibration clips after accepting CAL--120');
assert(profiles.includes('modelLocalOffset: [-0.11512, 0.00773, -0.01127]') && profiles.includes('gripLocalPosition: [0.6535, -0.02302, -0.07317]'), 'Meshy manual weapon placement must remain locked as repository truth');
assert(profiles.includes('modelLocalOffset: [0.00424, -0.0167, 0.01744]') && profiles.includes('gripLocalPosition: [0.67888, -0.07803, -0.06249]'), 'FPS manual weapon placement must remain locked as repository truth');
assert(socketSolver.includes('MANUAL_PLACEMENT_LOCK') && socketSolver.includes('promotable: false') && socketSolver.includes('productionSnippet: null') && socketSolver.includes('candidateModelLocalOffset: null'), 'socket diagnostics must not be able to promote or print production manual-placement overrides');
assert(!profiles.includes("sourceWeapon: 'Weapon.R'") && !profiles.includes("targetWeapon: 'WeaponGrip'"), 'visual IK Ready must not emit normal weapon tracks');
assert(profiles.includes("mode: 'world-joint-projection'"), 'Meshy Ready should use constrained world-joint projection');
assert(profiles.includes("sourceRestClip: '0T-Pose'") && profiles.includes("targetRestProvider: 'skin-bind'"), 'Meshy wrist parity should retarget from explicit source and target rest providers');
assert(cacheToken, 'runtime should declare a lab cache token');
assert(html.includes(`./src/rig-profiles.js?v=${cacheToken}`), 'HTML should load current rig profile token');
assert(html.includes(`./src/pose-lab.js?v=${cacheToken}`), 'HTML should load current runtime token');

if (failures.length) throw new Error(failures.join('\\n'));
console.log(JSON.stringify({ checked: ['visual-ik-ready-core-retarget-contract', 'manual-weapon-placement-preserved'] }, null, 2));
