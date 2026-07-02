import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes("spec.retargetMode === 'position-guided-arm'"), 'runtime may keep source-grip IK machinery for diagnostics and future use');
assert(js.includes("spec.retargetMode === 'fps-upper-key-convert'"), 'runtime should retain the legacy/rest-calibration source-key converter');
assert(profiles.includes("retargetMode: 'meshy-fps-visual-ik-ready'"), 'Meshy Ready should use the Visual-IK candidate generator');
assert(!profiles.includes("clipTag: 'GRIP'"), 'Meshy profile should not generate rejected GRIP clips');
assert(!profiles.includes("sourceKey: 'ruinedAir'") && !profiles.includes("originPrefix: 'source-grip:ruinedAir->meshyCharacter'"), 'rejected Scavenger/Ruined Air GRIP source should not remain in the active profile');
assert(!profiles.includes("positionGuidedArmClips: {\n          allClips: true"), 'active Meshy Ready profile must not define sampled source hand IK');
assert(profiles.includes("sourceKey: 'player'"), 'Meshy should source the new clips from FPS Arms');
assert(profiles.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'Meshy should generate the Visual-IK Ready candidate, not the retired FPS-SWORD-UPPER ready path');
assert(js.includes("meshy-fps-visual-ik-ready"), 'Meshy Ready dispatch should retain the Visual-IK candidate path');
assert(!profiles.includes("targetWeapon: 'WeaponGrip'"), 'Meshy Ready candidate must not key the WeaponGrip socket directly');

if (failures.length) throw new Error('rejected Scavenger GRIP tuning should not remain in the active Meshy profile: ' + failures.join('\n'));
console.log(JSON.stringify({ checked: ['rejected-scavenger-grip-path-removed', 'visual-ik-ready-path-active'] }, null, 2));
