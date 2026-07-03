import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const swordStart = profiles.indexOf("clipTag: 'FPS-SWORD-UPPER'");
const restStart = swordStart >= 0 ? profiles.indexOf("clipTag: 'FPS-REST-ARMS-CAL'", swordStart) : -1;
const swordBlock = swordStart >= 0 && restStart > swordStart ? profiles.slice(swordStart, restStart) : '';

assert(!profiles.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'failed Meshy FPS-VISUAL-IK-GOLDEN profile block must not be promoted');
assert(!profiles.includes("worldJointProjection: {"), 'failed world-joint projection Ready path must not be promoted');
assert(!profiles.includes("rollCorrection: {"), 'failed Visual-IK roll correction block must not be promoted');
assert(swordBlock, 'missing restored Meshy FPS-SWORD-UPPER profile block');
assert(/clipNames:\s*\[\s*'OneHandReady',\s*\]/.test(swordBlock), 'restored canary applies to the OneHandReady review clip');
assert(swordBlock.includes("sourceHand: 'Hand.R'") && swordBlock.includes("sourceWeapon: 'Weapon.R'"), 'restored ready path should measure authored right hand and weapon source tracks');
assert(swordBlock.includes("targetHand: 'RightHand'") && swordBlock.includes("targetWeapon: 'WeaponGrip'"), 'restored ready path should target Meshy RightHand and WeaponGrip');
assert(swordBlock.includes("{ from: 'Arm.R', to: 'RightArm', strength: 0.85 }"), 'restored profile should preserve the right upper arm source mapping');
assert(swordBlock.includes("{ from: 'Forearm.R', to: 'RightForeArm', strength: 1.0 }"), 'restored profile should preserve the right forearm source mapping');
assert(swordBlock.includes("{ from: 'Hand.R', to: 'RightHand', strength: 1.0 }"), 'restored profile should preserve the right hand source mapping');
assert(swordBlock.includes("{ from: 'Arm.L', to: 'LeftArm', strength: 0.85 }"), 'restored profile should preserve the left upper arm source mapping');
assert(swordBlock.includes("{ from: 'Forearm.L', to: 'LeftForeArm', strength: 1.0 }"), 'restored profile should preserve the left forearm source mapping');
assert(!swordBlock.includes("targetWeapon: 'WeaponR'"), 'restored profile should not target runtime WeaponR');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-visual-ik-candidate-absent', 'restored-fps-sword-upper-right-arm-canary'] }, null, 2));
