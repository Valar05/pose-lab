import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const visualIkStart = profiles.indexOf("clipTag: 'FPS-VISUAL-IK-GOLDEN'");
const nextClipTag = visualIkStart >= 0 ? profiles.indexOf('clipTag:', visualIkStart + 1) : -1;
const blockEnd = nextClipTag > visualIkStart ? nextClipTag : profiles.indexOf('],', visualIkStart);
const visualIkBlock = visualIkStart >= 0 && blockEnd > visualIkStart
  ? profiles.slice(visualIkStart, blockEnd)
  : '';
const projectionStart = visualIkBlock.indexOf('worldJointProjection: {');
const rollStart = visualIkBlock.indexOf('rollCorrection: {', projectionStart);
const weaponStart = visualIkBlock.indexOf('weaponKeyConvert: {', rollStart);
const projectionBlock = projectionStart >= 0 && rollStart > projectionStart ? visualIkBlock.slice(projectionStart, rollStart) : '';
const rollBlock = rollStart >= 0 && weaponStart > rollStart ? visualIkBlock.slice(rollStart, weaponStart) : '';
const weaponBlock = weaponStart >= 0 ? visualIkBlock.slice(weaponStart) : '';

assert(visualIkBlock, 'missing Meshy FPS-VISUAL-IK-GOLDEN profile block');
assert(projectionBlock, 'missing Meshy FPS-VISUAL-IK-GOLDEN world-joint projection block');
assert(rollBlock, 'missing Meshy FPS-VISUAL-IK-GOLDEN roll correction block');
assert(/clipNames:\s*\[\s*'OneHandReady',\s*\]/.test(visualIkBlock), 'right-arm canary applies to the OneHandReady review clip');
assert(rollBlock.includes("mode: 'world-down-delta'") && rollBlock.includes('rightMaxTwistDeg: 180') && rollBlock.includes('leftMaxTwistDeg: 180'), 'golden projection should allow separate right/left roll-only correction bounds');
assert(projectionBlock.includes('rightArmCanary: true') && projectionBlock.includes('rollOffsetDeg: -120'), 'right arm canary should carry the accepted -120 roll offset');
assert(projectionBlock.includes('rollOffsetDeg: -90'), 'left arm should carry the accepted -90 roll offset');
assert(projectionBlock.includes("sourceUpper: 'Arm.R'") && projectionBlock.includes("sourceLower: 'Forearm.R'") && projectionBlock.includes("sourceHand: 'Hand.R'"), 'active canary should measure the complete right source arm chain');
assert(projectionBlock.includes("targetUpper: 'RightArm'"), 'active projection should target the Meshy right upper arm');
assert(projectionBlock.includes("targetLower: 'RightForeArm'"), 'active projection should target the Meshy right forearm');
assert(projectionBlock.includes("targetHand: 'RightHand'"), 'active projection should target the Meshy right hand');
assert(projectionBlock.includes("sourceUpper: 'Arm.L'") && projectionBlock.includes("sourceLower: 'Forearm.L'") && projectionBlock.includes("sourceHand: 'Hand.L'"), 'active projection should also measure the complete left source arm chain');
assert(weaponBlock.includes('enabled: true') && weaponBlock.includes("targetWeapon: 'WeaponR'") && weaponBlock.includes('applyToHand: false'), 'weapon solve should animate synthetic WeaponR without overwriting the hand canary or manual WeaponGrip attachment');
assert(!visualIkBlock.includes("targetWeapon: 'WeaponGrip'") && !visualIkBlock.includes('applyToHand: true'), 'FPS-VISUAL-IK profile must remain hand-roll plus synthetic WeaponR, not a direct WeaponGrip animation path');

if (failures.length) throw new Error(failures.join('\\n'));
console.log(JSON.stringify({ checked: ['meshy-golden-ready-roll-record', 'right-minus-120-left-minus-90', 'synthetic-weaponr-does-not-overwrite-hand'] }, null, 2));
