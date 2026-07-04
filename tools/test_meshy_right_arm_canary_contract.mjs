import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const readyRuntime = fs.readFileSync(path.join(projectRoot, 'src', 'meshy-ready-runtime.mjs'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const readyStart = profiles.indexOf("retargetMode: 'meshy-fps-visual-ik-ready'");
const restCalStart = profiles.indexOf("clipTag: 'FPS-REST-ARMS-CAL'", readyStart);
const readyBlock = readyStart >= 0 && restCalStart > readyStart
  ? profiles.slice(readyStart, restCalStart)
  : '';

assert(readyBlock, 'missing Meshy FPS-VISUAL-IK-GOLDEN profile block');
assert(readyBlock.includes("retargetMode: 'meshy-fps-visual-ik-ready'"), 'right-arm canary should use the explicit golden Ready helper');
assert(readyBlock.includes("clipNames: [\n          'OneHandReady',\n        ]"), 'right-arm canary applies to the OneHandReady review clip');
assert(readyBlock.includes("sourceRestClip: '0T-Pose'"), 'golden Ready should use the FPS 0T-Pose rest reference');
assert(readyBlock.includes("targetRestProvider: 'skin-bind'"), 'golden Ready should use Meshy skin-bind target rest');
assert(readyBlock.includes('restSegmentCorrection: meshyFpsRestSegmentCorrection(-120)'), 'golden Ready should preserve the accepted right-hand rest correction');
assert(readyBlock.includes('rightRollOffsetDeg: 0'), 'golden Ready should preserve the current right-hand roll');
assert(readyBlock.includes('leftRollOffsetDeg: -90'), 'golden Ready should preserve the accepted left-hand roll');
assert(readyBlock.includes("mode: 'world-joint-projection'"), 'active correction method should use constrained world-joint projection');
assert(readyBlock.includes('restRelative: true'), 'active projection should preserve source keys as rest-relative joint deltas');
assert(!readyBlock.includes('weaponKeyConvert'), 'golden Ready profile must not enable normal weapon-key conversion');
assert(!readyBlock.includes('targetWeapon'), 'golden Ready profile must not target WeaponGrip with generated tracks');

assert(readyRuntime.includes("{ label: 'right', sourceUpper: 'Arm.R', sourceLower: 'Forearm.R', sourceHand: 'Hand.R'"), 'active canary should measure the complete right source arm chain');
assert(readyRuntime.includes("targetUpper: 'RightArm'"), 'active projection should target the Meshy right upper arm');
assert(readyRuntime.includes("targetLower: 'RightForeArm'"), 'active projection should target the Meshy right forearm');
assert(readyRuntime.includes("targetHand: 'RightHand'"), 'active projection should target the Meshy right hand');
assert(readyRuntime.includes("{ label: 'left', sourceUpper: 'Arm.L', sourceLower: 'Forearm.L', sourceHand: 'Hand.L'"), 'active projection should also measure the complete left source arm chain');
assert(readyRuntime.includes('constrainedTwoBoneWorldJoints'), 'active projection should pin arm joints with constrained two-bone world targets');
assert(readyRuntime.includes('solveArmToWorldJoints'), 'active projection should solve the FK chain to the pinned joints');
assert(readyRuntime.includes('rolledWorldQuaternionToDownReference'), 'active projection should apply roll after placement');
assert(readyRuntime.includes('weaponConfig.enabled === true && weaponConfig.experimentalWeaponSwing === true'), 'weapon solve must remain inert for the hand canary unless explicitly experimental');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: [
    'meshy-right-arm-golden-ready-canary',
    'right-arm-world-joint-projection',
    'weapon-does-not-overwrite-hand',
  ],
}, null, 2));
