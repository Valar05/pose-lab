import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const workflowState = JSON.parse(fs.readFileSync(path.join(projectRoot, 'generated', 'workflow_state', 'meshy_fps_accepted_baseline.json'), 'utf8'));
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function blockAfter(marker) {
  const start = profiles.indexOf(marker);
  if (start < 0) return '';
  const end = profiles.indexOf('        },', start);
  return end > start ? profiles.slice(start, end) : profiles.slice(start);
}

const visualIkOverride = blockAfter("clipPattern: 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]'");
const swordUpperOverride = blockAfter("clipPattern: 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]'");

assert(workflowState.acceptedClip === '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', 'accepted baseline must remain the user-verified T-pose rest calibration');
assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'Meshy startup must preserve the accepted T-pose baseline');
assert(profiles.includes("SwordReady: ['0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', '0T-Pose -> meshyCharacter:FPS-REST-ARMS-CAL--120', '0T-Pose']"), 'SwordReady must not promote a Ready candidate while the visual relationship is red');
assert(profiles.includes("visibleClipPatterns: ['\\\\[FPS-REST-ARMS']"), 'default weapon visibility must remain scoped to the accepted rest-arms surface');

assert(profiles.includes('rotationDeg: [90, 0, -55.145]'), 'base Meshy sabre attachment rotation must preserve the accepted manual baseline');
assert(profiles.includes('gripLocalPosition: [0.6535, -0.02302, -0.07317]'), 'base Meshy hilt oracle must remain unchanged');
assert(profiles.includes('tipLocalPosition: [-0.95561, 0.1368, 0]'), 'base Meshy tip oracle must remain unchanged');

assert(visualIkOverride, 'Visual-IK Ready review override should exist for cloud review positioning');
assert(visualIkOverride.includes('position: [0.14, 0.09, 0]'), 'Visual-IK Ready may keep only the scoped hilt target position during red review');
assert(!visualIkOverride.includes('rotationDeg:'), 'Visual-IK Ready must not rotate the sabre locally without accepted visual promotion evidence');
assert(!profiles.includes('rotationDeg: [90, 0, 124.855]'), 'known bad Ready sabre rotation override must not return');

assert(swordUpperOverride, 'FPS-SWORD-UPPER Ready review override should remain explicit and scoped');
assert(!swordUpperOverride.includes('rotationDeg:'), 'FPS-SWORD-UPPER Ready must not add a clip-scoped sabre rotation override');

if (failures.length) throw new Error(failures.join('\n'));

console.log(JSON.stringify({
  checked: 'meshy-baseline-weapon-relationship',
  acceptedClip: workflowState.acceptedClip,
  readyRotationOverrideAllowed: false,
}, null, 2));
