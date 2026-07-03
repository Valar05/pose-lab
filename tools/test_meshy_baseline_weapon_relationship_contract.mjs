import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const workflowState = JSON.parse(fs.readFileSync(path.join(projectRoot, 'generated', 'workflow_state', 'meshy_fps_accepted_baseline.json'), 'utf8'));
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function objectBlock(marker, nextMarker) {
  const start = profiles.indexOf(marker);
  if (start < 0) return '';
  const end = profiles.indexOf(nextMarker, start);
  return end > start ? profiles.slice(start, end) : profiles.slice(start);
}

const weaponProxyBlock = objectBlock('    weaponProxy: {', '    weaponAttachment: {');
const weaponAttachmentBlock = objectBlock('    weaponAttachment: {', '    extraClipUrls: [');
const readyAttachmentOverrideBlock = weaponAttachmentBlock.slice(weaponAttachmentBlock.indexOf('clipOverrides: ['));

assert(workflowState.acceptedClip === '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', 'accepted baseline must remain the user-verified T-pose rest calibration');
assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'Meshy startup must preserve the accepted T-pose baseline');
assert(profiles.includes("SwordReady: ['0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', '0T-Pose -> meshyCharacter:FPS-REST-ARMS-CAL--120', '0T-Pose']"), 'SwordReady must not promote a Ready candidate while the visual relationship is red');
assert(profiles.includes("visibleClipPatterns: ['\\\\[FPS-REST-ARMS']"), 'default weapon visibility must remain scoped to the accepted rest-arms surface');

assert(profiles.includes('rotationDeg: [90, 0, -55.145]'), 'base Meshy sabre attachment rotation must preserve the accepted manual baseline');
assert(profiles.includes('gripLocalPosition: [0.6535, -0.02302, -0.07317]'), 'base Meshy hilt oracle must remain unchanged');
assert(profiles.includes('tipLocalPosition: [-0.95561, 0.1368, 0]'), 'base Meshy tip oracle must remain unchanged');

assert(weaponProxyBlock.includes("clipPattern: 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]'") && weaponProxyBlock.includes('gripOffset: [14, 9, 0]'), 'Visual-IK Ready may move only the FK WeaponGrip socket through an authored proxy gripOffset in Meshy bone-local units');
assert(weaponProxyBlock.includes("clipPattern: 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]'") && weaponProxyBlock.includes('gripOffset: [14, 9, 0]'), 'FPS-SWORD-UPPER Ready may move only the FK WeaponGrip socket through an authored proxy gripOffset in Meshy bone-local units');
assert(readyAttachmentOverrideBlock.includes("clipPattern: 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]'") && readyAttachmentOverrideBlock.includes("clipPattern: 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]'"), 'Ready attachment override must be scoped only to the two Ready review clips');
assert(readyAttachmentOverrideBlock.includes('rotationDeg: [41.704, 12.774, -173.407]'), 'Ready attachment override may rotate only the visible blade basis under the FK socket');
for (const forbidden of ['position:', 'scale:', 'gripLocalPosition:', 'tipLocalPosition:', 'modelLocalOffset:', 'handLocalOffset:', 'gripOffset:']) {
  assert(!readyAttachmentOverrideBlock.includes(forbidden), `Ready attachment override must not change ${forbidden}`);
}
assert(!profiles.includes('rotationDeg: [90, 0, 124.855]'), 'known bad Ready sabre rotation override must not return');

if (failures.length) throw new Error(failures.join('\n'));

console.log(JSON.stringify({
  checked: 'meshy-baseline-weapon-relationship',
  acceptedClip: workflowState.acceptedClip,
  readyRotationOverrideAllowed: 'rotation-only',
}, null, 2));
