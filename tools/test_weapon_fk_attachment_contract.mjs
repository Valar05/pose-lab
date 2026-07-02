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
assert(poseLabSource.includes('experimentalWeaponSwing === true'), 'Meshy generated weapon tracks must be quarantined behind an explicit experimental flag');
assert(weaponRulesSource.includes('const allowAnimatedGrip = animatedSocketRotation && config.allowAnimatedSocketAnimation === true'), 'synthetic source sockets should ignore accidental WeaponGrip tracks unless explicitly opted in');
assert(weaponRulesSource.includes('proxy.root.quaternion.copy(proxy.fkLocalQuaternion);'), 'hand-fk runtime must restore the cached local WeaponGrip quaternion every frame');
assert(profilesSource.includes("parentMode: 'hand-fk'") && profilesSource.includes("placementAuthority: 'manual-golden'") && profilesSource.includes('allowAnimatedSocketAnimation: false'), 'Meshy profile should declare pure FK manual placement authority and forbid animated WeaponGrip placement');

assert(fixed.artifact.schema === 'pose-lab-offline-pose-weapon-render-v1', 'fixed render should use canonical offline schema');
assert(fixed.artifact.ok === true, `fixed render should prove Meshy sword FK is green: ${JSON.stringify(fixed.artifact.checks)}`);
assert(fixed.artifact.checks?.parentChainMatchesPureFkShape === true, `Meshy weapon should use direct pure FK chain shape: ${JSON.stringify(fixed.artifact.sampleData?.[0]?.parentChain)}`);
assert(fixed.artifact.sampleData?.every((sample) => sample.parentChain.join('>') === 'Meshy French Revolution Sabre>WeaponGrip-display-root>WeaponGrip>RightHand'), 'each sample should keep model -> displayRoot -> WeaponGrip -> RightHand ownership');
assert(fixed.artifact.checks?.weaponGripLocalStableUnderRightHand === true, `WeaponGrip should stay locally stable under RightHand: ${JSON.stringify(fixed.artifact.maxLocalDrift)}`);
assert(fixed.artifact.checks?.weaponGripQuaternionStableUnderRightHand === true, `WeaponGrip local quaternion should stay stable under RightHand: ${JSON.stringify(fixed.artifact.maxLocalDrift)}`);
assert(fixed.artifact.checks?.appliedHiltPinnedToWeaponGrip === true, `applied hilt should stay pinned to WeaponGrip: ${JSON.stringify(fixed.artifact.hiltSocketDistances)}`);
assert(fixed.artifact.checks?.appliedHiltAwayFromRawHand === true, `applied hilt should not collapse onto the raw hand: ${JSON.stringify(fixed.artifact.maxDistances)}`);
assert(Number(fixed.artifact.maxDistances?.rawHandToAppliedHilt) >= Number(fixed.artifact.thresholds?.displacementMinDistance || 0.05), `raw hand to applied hilt distance should exceed displacement threshold: ${JSON.stringify(fixed.artifact.maxDistances)}`);

assert(fault.artifact.injectedFaults?.some((entry) => entry.name === 'collapse-displacement'), 'fault render should record injected collapsed-displacement fault');
assert(fault.artifact.ok === false, 'collapsed-displacement fault should not pass the FK contract');
assert(fault.artifact.checks?.appliedHiltAwayFromRawHand === false, `fault should collapse hilt onto raw hand/wrist: ${JSON.stringify(fault.artifact.maxDistances)}`);
assert(fault.artifact.reproducesLiveRed === true, 'collapsed-displacement fault should reproduce the red-build class');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['offline-pure-fk-chain-shape', 'visible-hilt-displacement', 'right-hand-local-stability', 'collapse-displacement-negative-control'],
  fixed: fixed.result.path,
  fault: fault.result.path,
}, null, 2));
