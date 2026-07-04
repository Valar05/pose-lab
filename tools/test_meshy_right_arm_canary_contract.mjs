import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const swordClipTag = profiles.indexOf("clipTag: 'FPS-SWORD-UPPER'");
const swordStart = swordClipTag >= 0 ? profiles.lastIndexOf('      {', swordClipTag) : -1;
const restStart = swordClipTag >= 0 ? profiles.indexOf("clipTag: 'FPS-REST-ARMS-CAL'", swordClipTag) : -1;
const swordBlock = swordStart >= 0 && restStart > swordStart ? profiles.slice(swordStart, restStart) : '';

assert(!profiles.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'failed Meshy FPS-VISUAL-IK-GOLDEN profile block must not be promoted');
assert(swordBlock.includes("retargetMode: 'world-joint-projection'"), 'Ready profile should use world-joint projection for the hand pose');
assert(!profiles.includes("rollCorrection: {"), 'failed Visual-IK roll correction block must not be promoted');
assert(swordBlock, 'missing restored Meshy FPS-SWORD-UPPER profile block');
assert(/clipNames:\s*\[\s*'OneHandReady',\s*\]/.test(swordBlock), 'restored canary applies to the OneHandReady review clip');
assert(swordBlock.includes("sourceHand: 'Hand.R'") && swordBlock.includes("targetHand: 'RightHand'"), 'restored ready path should solve authored right hand world joints onto Meshy RightHand');
assert(swordBlock.includes("sourceUpper: 'Arm.R'") && swordBlock.includes("targetUpper: 'RightArm'"), 'restored profile should preserve the right upper arm source mapping');
assert(swordBlock.includes("sourceLower: 'Forearm.R'") && swordBlock.includes("targetLower: 'RightForeArm'"), 'restored profile should preserve the right forearm source mapping');
assert(swordBlock.includes("sourceUpper: 'Arm.L'") && swordBlock.includes("targetUpper: 'LeftArm'"), 'restored profile should preserve the left upper arm source mapping');
assert(swordBlock.includes("sourceLower: 'Forearm.L'") && swordBlock.includes("targetLower: 'LeftForeArm'"), 'restored profile should preserve the left forearm source mapping');
assert(!swordBlock.includes('weaponKeyConvert'), 'Ready pose canary must not key WeaponGrip; direct hand FK owns the weapon at runtime');
assert(!swordBlock.includes("targetWeapon: 'WeaponR'"), 'restored profile should not target runtime WeaponR');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-visual-ik-candidate-absent', 'restored-fps-sword-upper-right-arm-canary'] }, null, 2));
