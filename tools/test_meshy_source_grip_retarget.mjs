import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes("spec.retargetMode === 'position-guided-arm'"), 'runtime may keep source-grip IK machinery for diagnostics and future use');
assert(js.includes("spec.retargetMode === 'fps-upper-key-convert'"), 'runtime should dispatch the accepted FPS upper source-key converter');
assert(profiles.includes("retargetMode: 'fps-upper-key-convert'"), 'Meshy should convert authored FPS upper-body sword keys');
assert(!profiles.includes("clipTag: 'GRIP'"), 'Meshy profile should not generate rejected GRIP clips');
assert(!profiles.includes("sourceKey: 'ruinedAir'") && !profiles.includes("originPrefix: 'source-grip:ruinedAir->meshyCharacter'"), 'rejected Scavenger/Ruined Air GRIP source should not remain in the active profile');
assert(!profiles.includes("positionGuidedArmClips: {\n          allClips: true"), 'accepted Meshy FPS sword profile must not define sampled source hand IK');
assert(profiles.includes("sourceKey: 'player'"), 'Meshy should source the new clips from FPS Arms');
assert(profiles.includes("clipTag: 'FPS-SWORD-UPPER'"), 'Meshy should generate only FPS-SWORD-UPPER sword clips');
assert(js.includes("fps-upper-key-convert source-authored-times"), 'Meshy FPS sword clips should report source-authored key conversion');
assert(!profiles.includes("targetWeapon: 'WeaponR'") && !profiles.includes("targetWeapon: 'WeaponGrip'"), 'Meshy FPS sword retarget should leave weapon attachment to pure FK');

if (failures.length) throw new Error('rejected Scavenger GRIP tuning should not remain in the active Meshy profile: ' + failures.join('\n'));
console.log(JSON.stringify({ checked: ['rejected-scavenger-grip-path-removed', 'fps-source-key-convert-sword-path-active'] }, null, 2));
