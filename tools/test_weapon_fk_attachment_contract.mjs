import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const toolPath = path.join(projectRoot, 'tools', 'pose_lab_offline_render.mjs');
const fixedOut = path.join(projectRoot, 'generated', 'test_runs', `weapon-fk-contract-fixed-${process.pid}`);
const faultOut = path.join(projectRoot, 'generated', 'test_runs', `weapon-fk-contract-fault-${process.pid}`);
const poseLabSource = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const weaponRulesSource = fs.readFileSync(path.join(projectRoot, 'src', 'weapon-runtime-rules.mjs'), 'utf8');
const profilesSource = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

function render(args) {
  const output = execFileSync('node', [toolPath, ...args], { cwd: projectRoot, encoding: 'utf8' });
  const result = JSON.parse(output.slice(output.indexOf('{')));
  const artifact = JSON.parse(fs.readFileSync(path.join(projectRoot, result.path), 'utf8'));
  return { result, artifact };
}

const fixed = render(['--out', fixedOut, '--samples', '3']);
const fault = render(['--out', faultOut, '--samples', '2', '--fault', 'collapse-displacement']);

assert(!poseLabSource.includes("weaponConfig.targetWeapon || 'WeaponGrip'"), 'generated weapon tracks must not default to animating WeaponGrip');
assert(poseLabSource.includes("weaponConfig.targetWeapon || 'WeaponR'"), 'generated weapon tracks should default to synthetic/source WeaponR');
assert(weaponRulesSource.includes('const allowAnimatedGrip = animatedSocketRotation && config.allowAnimatedSocketAnimation === true'), 'synthetic source sockets should ignore accidental WeaponGrip tracks unless explicitly opted in');
assert(weaponRulesSource.includes('if (!allowAnimatedGrip) proxy.root.quaternion.copy(proxy.syntheticFkLocalQuaternion);'), 'WeaponGrip should keep the manual local quaternion under animated WeaponR');
assert(profilesSource.includes("placementAuthority: 'manual-golden'") && profilesSource.includes('allowAnimatedSocketAnimation: false'), 'Meshy profile should declare manual placement authority and forbid animated WeaponGrip placement');

assert(fixed.artifact.schema === 'pose-lab-offline-pose-weapon-render-v1', 'fixed render should use canonical offline schema');
assert(fixed.artifact.ok === true, `fixed render should prove Meshy sword FK is green: ${JSON.stringify(fixed.artifact.checks)}`);
assert(fixed.artifact.checks?.parentChainMatchesFpsArmsShape === true, `Meshy weapon should mirror FPS chain shape: ${JSON.stringify(fixed.artifact.sampleData?.[0]?.parentChain)}`);
assert(fixed.artifact.sampleData?.every((sample) => sample.parentChain.join('>') === 'Meshy French Revolution Sabre>WeaponGrip-display-root>WeaponGrip>WeaponR>RightHand'), 'each sample should keep model -> displayRoot -> WeaponGrip -> WeaponR -> RightHand ownership');
assert(fixed.artifact.checks?.weaponGripLocalStableUnderWeaponR === true, `WeaponGrip should stay locally stable under animated WeaponR: ${JSON.stringify(fixed.artifact.maxLocalDrift)}`);
assert(fixed.artifact.checks?.weaponGripDisplacedFromWeaponR === true, `WeaponGrip should preserve authored displacement from WeaponR: ${JSON.stringify(fixed.artifact.maxDistances)}`);
assert(fixed.artifact.checks?.appliedHiltPinnedToWeaponGrip === true, `applied hilt should stay pinned to WeaponGrip: ${JSON.stringify(fixed.artifact.hiltSocketDistances)}`);
assert(fixed.artifact.checks?.appliedHiltAwayFromRawHand === true, `applied hilt should not collapse onto the raw hand: ${JSON.stringify(fixed.artifact.maxDistances)}`);
assert(fixed.artifact.checks?.weaponBladeDirectionMatchesFpsSource === true, `visible blade should match mapped FPS Weapon.R: ${JSON.stringify(fixed.artifact.maxWeaponOrientationErrorDeg)}`);
assert(Number(fixed.artifact.maxDistances?.rawHandToAppliedHilt) >= Number(fixed.artifact.thresholds?.displacementMinDistance || 0.05), `raw hand to applied hilt distance should exceed displacement threshold: ${JSON.stringify(fixed.artifact.maxDistances)}`);

assert(fault.artifact.injectedFaults?.some((entry) => entry.name === 'collapse-displacement'), 'fault render should record injected collapsed-displacement fault');
assert(fault.artifact.ok === false, 'collapsed-displacement fault should not pass the FK contract');
assert(fault.artifact.checks?.weaponGripDisplacedFromWeaponR === false, `fault should collapse WeaponGrip displacement: ${JSON.stringify(fault.artifact.maxDistances)}`);
assert(fault.artifact.checks?.appliedHiltAwayFromRawHand === false, `fault should collapse hilt onto raw hand/wrist: ${JSON.stringify(fault.artifact.maxDistances)}`);
assert(fault.artifact.reproducesLiveRed === true, 'collapsed-displacement fault should reproduce the red-build class');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['offline-fk-chain-shape', 'visible-hilt-displacement', 'weaponr-local-stability', 'collapse-displacement-negative-control'],
  fixed: fixed.result.path,
  fault: fault.result.path,
}, null, 2));
