import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const runtimePath = path.join(projectRoot, 'src', 'pose-lab.js');
const profilesPath = path.join(projectRoot, 'src', 'rig-profiles.js');
const evidencePath = path.join(projectRoot, 'generated', 'visual_red_build', 'meshy_ready_weapon_fk_follow_latest.json');
const runtime = fs.readFileSync(runtimePath, 'utf8');
const profiles = fs.readFileSync(profilesPath, 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

function currentCacheToken() {
  const match = runtime.match(/const\s+LAB_CACHE_TOKEN\s*=\s*['"]([^'"]+)['"]/);
  return match?.[1] || '';
}

function assertOrdered(source, markers, label) {
  let cursor = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1);
    assert(next > cursor, `${label}: expected marker after previous marker: ${marker}`);
    cursor = next;
  }
}

assert(fs.existsSync(evidencePath), 'missing ready weapon FK visual red-build evidence artifact');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
assert(evidence.schema === 'pose-lab-ready-weapon-fk-red-build-v1', 'ready weapon FK evidence schema mismatch');
assert(evidence.currentFixCacheToken === currentCacheToken(), `evidence currentFixCacheToken should match ${currentCacheToken()}`);
assert(fs.existsSync(evidence.tPoseCapturePath), 'T-pose screenshot evidence path should exist');
assert(fs.existsSync(evidence.readyCapturePath), 'Ready screenshot evidence path should exist');
assert(evidence.visualAssertions?.tPoseWeaponPlacementAccepted === true, 'evidence should record accepted T-pose weapon placement');
assert(evidence.visualAssertions?.readyHandsCorrected === true, 'evidence should record corrected Ready hands');
assert(evidence.visualAssertions?.readySwordNotFollowingFinalFk === true, 'evidence should record the red Ready sword FK-follow failure');
assert(evidence.visualAssertions?.expectedNextReadySwordFollowsFinalRightHandFk === true, 'evidence should state the next visible acceptance target');

assertOrdered(runtime, [
  'this.mixer.setTime(0);',
  'this.reapplyBoneEdits();',
  'this.applyGrounding();',
  'this.updateWeaponProxyVisibility();',
  'this.updateDebugHelpers();',
], 'clip start should update weapon after final pose edits');

const updateStart = runtime.indexOf('  update(dt) {');
const updateEnd = runtime.indexOf('\n  }', updateStart + 1);
const updateBlock = runtime.slice(updateStart, updateEnd);
assertOrdered(updateBlock, [
  'this.mixer.update(dt);',
  'this.reapplyBoneEdits();',
  'this.applyGrounding();',
  'this.updateWeaponProxyVisibility();',
  'this.updateLegSymmetryOverlay();',
], 'per-frame update should make weapon follow final FK pose');

assert(runtime.includes('proxy.root.quaternion.copy(modelWorldQuat.multiply(worldQuaternionOf(proxy.rightHand))).normalize();'), 'synthetic WeaponGrip should copy final right-hand world rotation when no socket track exists');
assert(!profiles.includes("targetWeapon: 'WeaponGrip'") && !profiles.includes("sourceWeapon: 'Weapon.R'"), 'normal Ready clip must not key WeaponGrip or Weapon.R');
assert(!profiles.includes('weaponKeyConvert: {'), 'normal Ready profile must not re-enable weapon conversion');
assert(profiles.includes('handLocalOffset: [0.095, 0.035, -0.01]') && profiles.includes('modelLocalOffset: [-0.11512, 0.00773, -0.01127]'), 'Meshy manual weapon socket placement must remain locked');
assert(profiles.includes('rotationDeg: [90, 0, -55.145]') && profiles.includes('gripLocalPosition: [0.6535, -0.02302, -0.07317]'), 'Meshy manual saber attachment placement must remain locked');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['ready-weapon-fk-red-evidence', 'weapon-after-final-pose-order', 'manual-saber-literals-locked'], evidencePath: path.relative(projectRoot, evidencePath), cacheToken: currentCacheToken() }, null, 2));
