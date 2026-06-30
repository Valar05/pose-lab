import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const visualIkStart = profiles.indexOf("clipTag: 'FPS-VISUAL-IK'");
const candidateStart = profiles.indexOf("clipTag: 'FPS-JOINT-IK-CANDIDATE'", visualIkStart);
const restCalStart = profiles.indexOf("clipTag: 'FPS-REST-ARMS-CAL'", candidateStart > 0 ? candidateStart : visualIkStart);
const visualIkBlock = visualIkStart >= 0 && candidateStart > visualIkStart
  ? profiles.slice(visualIkStart, candidateStart)
  : '';
const candidateBlock = candidateStart >= 0 && restCalStart > candidateStart
  ? profiles.slice(candidateStart, restCalStart)
  : '';
const ikStart = visualIkBlock.indexOf('ikOrientationGuide: {');
const directStart = visualIkBlock.indexOf('directRotationPairs:', ikStart);
const ikBlock = ikStart >= 0 && directStart > ikStart ? visualIkBlock.slice(ikStart, directStart) : '';

assert(visualIkBlock, 'missing Meshy FPS-VISUAL-IK profile block');
assert(candidateBlock, 'missing Meshy FPS-JOINT-IK-CANDIDATE profile block');
assert(ikBlock, 'missing Meshy FPS-VISUAL-IK IK guide block');
assert(visualIkBlock.includes("clipNames: [\n          'OneHandReady',\n        ]"), 'right-arm canary applies to the OneHandReady review clip');
assert(ikBlock.includes("mode: 'world-joint-projection'") && ikBlock.includes('worldJointProjection: true') && ikBlock.includes('replaceTracks: true'), 'active correction method should use constrained world-joint projection');
assert(ikBlock.includes('restRelative: true'), 'active projection should preserve source keys as rest-relative joint deltas');
assert(ikBlock.includes("mode: 'world-down-delta'") && ikBlock.includes('rightMaxTwistDeg: 8'), 'active projection should roll after placement and cap right-hand twist for the canary');
assert(ikBlock.includes("sourceUpper: 'Arm.R'") && ikBlock.includes("sourceLower: 'Forearm.R'") && ikBlock.includes("sourceHand: 'Hand.R'"), 'active canary should measure the complete right source arm chain');
assert(ikBlock.includes("targetUpper: 'RightArm'"), 'active projection should target the Meshy right upper arm');
assert(ikBlock.includes("targetLower: 'RightForeArm'"), 'active projection should target the Meshy right forearm');
assert(ikBlock.includes("targetHand: 'RightHand'"), 'active projection should target the Meshy right hand');
assert(visualIkBlock.includes("sourceUpper: 'Arm.L'") && visualIkBlock.includes("sourceLower: 'Forearm.L'") && visualIkBlock.includes("sourceHand: 'Hand.L'"), 'active projection should also measure the complete left source arm chain');
assert(candidateBlock.includes("mode: 'world-joint-projection'") && candidateBlock.includes('worldJointProjection: true'), 'candidate should contain the joint-projection method under review');
assert(candidateBlock.includes('rightArmCanary: true') && candidateBlock.includes("preserveBaselineClip: 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK]'"), 'candidate should explicitly declare the protected right-arm baseline canary');
assert(visualIkBlock.includes("{ from: 'Arm.R', to: 'RightArm', strength: 0.85 }"), 'right arm should still receive baseline source-key direct mapping');
assert(visualIkBlock.includes("{ from: 'Forearm.R', to: 'RightForeArm', strength: 1.0 }"), 'right forearm should still receive baseline source-key direct mapping');
assert(visualIkBlock.includes("{ from: 'Hand.R', to: 'RightHand', strength: 1.0 }"), 'right hand should still receive baseline source-key direct mapping');
assert(visualIkBlock.includes('applyToHand: false') && visualIkBlock.includes('handStrength: 0'), 'weapon solve must not overwrite the right hand canary');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-right-arm-canary', 'right-arm-joint-projection', 'weapon-does-not-overwrite-hand'] }, null, 2));
