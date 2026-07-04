import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const readyRuntime = fs.readFileSync(path.join(projectRoot, 'src', 'meshy-ready-runtime.mjs'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes("spec.retargetMode === 'position-guided-arm'"), 'runtime may keep source-grip IK machinery for diagnostics and future use');
assert(js.includes("spec.retargetMode === 'meshy-fps-visual-ik-ready'"), 'runtime should dispatch the accepted golden Ready helper');
assert(profiles.includes("retargetMode: 'meshy-fps-visual-ik-ready'"), 'Meshy should generate golden FPS visual IK Ready');
assert(!profiles.includes("clipTag: 'GRIP'"), 'Meshy profile should not generate rejected GRIP clips');
assert(!profiles.includes("sourceKey: 'ruinedAir'") && !profiles.includes("originPrefix: 'source-grip:ruinedAir->meshyCharacter'"), 'rejected Scavenger/Ruined Air GRIP source should not remain in the active profile');
assert(!profiles.includes("positionGuidedArmClips: {\n          allClips: true"), 'accepted Meshy FPS sword profile must not define sampled source hand IK');
assert(profiles.includes("sourceKey: 'player'"), 'Meshy should source the new clips from FPS Arms');
assert(profiles.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'Meshy should generate only the accepted golden Ready clip');
assert(readyRuntime.includes("world-joint-projection source-authored-times"), 'Meshy FPS Ready clips should report source-authored world-joint projection');
assert(!profiles.includes("targetWeapon: 'WeaponGrip'"), 'Meshy FPS Ready should not key the WeaponGrip socket from source weapon tracks');

if (failures.length) throw new Error('rejected Scavenger GRIP tuning should not remain in the active Meshy profile: ' + failures.join('\n'));
console.log(JSON.stringify({ checked: ['rejected-scavenger-grip-path-removed', 'fps-visual-ik-golden-ready-active'] }, null, 2));
