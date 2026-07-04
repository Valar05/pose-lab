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

assert(workflowState.acceptedClip === '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', 'accepted baseline must remain the user-verified T-pose rest calibration');
assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'Meshy startup must preserve the accepted T-pose baseline');
assert(profiles.includes("SwordReady: ['0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', '0T-Pose -> meshyCharacter:FPS-REST-ARMS-CAL--120', '0T-Pose']"), 'SwordReady must not promote a Ready candidate while the visual relationship is red');
assert(profiles.includes("visibleClipPatterns: ['\\\\[FPS-REST-ARMS']"), 'default weapon visibility must remain scoped to the accepted rest-arms surface');

assert(profiles.includes('rotationDeg: [0, 0, 0]'), 'base Meshy WeaponGrip socket rotation must remain identity for boring FK');
assert(profiles.includes('rotationDeg: [-67.582, 76.718, -60.52]'), 'base Meshy sabre attachment rotation must preserve the user-authored shared FK calibration');
assert(profiles.includes('gripLocalPosition: [0.73272, 0.0091, -0.01674]'), 'base Meshy hilt oracle must remain unchanged');
assert(profiles.includes('tipLocalPosition: [-0.95561, 0.1368, 0]'), 'base Meshy tip oracle must remain unchanged');

assert(!weaponProxyBlock.includes('clipOverrides:'), 'Meshy weapon proxy must not use Ready-only offsets; T-pose and Ready share FK placement');
assert(!weaponAttachmentBlock.includes('clipOverrides:'), 'Meshy weapon attachment must not use Ready-only blade rotation; T-pose and Ready share sabre mesh placement');
assert(!profiles.includes('rotationDeg: [90, 0, 124.855]'), 'known bad Ready sabre rotation override must not return');

if (failures.length) throw new Error(failures.join('\n'));

console.log(JSON.stringify({
  checked: 'meshy-baseline-weapon-relationship',
  acceptedClip: workflowState.acceptedClip,
  sharedFkWeaponPlacement: true,
}, null, 2));
