import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const toolPath = path.join(projectRoot, 'tools', 'pose_lab_offline_render.mjs');
const fixedOut = path.join(projectRoot, 'generated', 'test_runs', `weapon-baseline-contract-fixed-${process.pid}`);
const profilesSource = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

function render(args) {
  const output = execFileSync('node', [toolPath, ...args], { cwd: projectRoot, encoding: 'utf8' });
  const result = JSON.parse(output.slice(output.indexOf('{')));
  const artifact = JSON.parse(fs.readFileSync(path.join(projectRoot, result.path), 'utf8'));
  return { result, artifact };
}

const fixed = render([
  '--actor', 'meshyCharacter',
  '--clip', '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]',
  '--out', fixedOut,
  '--samples', '3',
]);

assert(profilesSource.includes('rotationDeg: [90, 0, -55.145]'), 'Meshy sabre rotation must match the accepted pre-FK T-pose baseline');
assert(profilesSource.includes('gripLocalPosition: [0.6535, -0.02302, -0.07317]'), 'Meshy sabre hilt oracle must match the accepted pre-FK T-pose baseline');
assert(!profilesSource.includes("parentMode: 'hand-fk'"), 'Meshy production profile must not promote the failed hand-fk override');
assert(!profilesSource.includes("placementAuthority: 'manual-golden'"), 'Meshy production profile must not keep the failed manual-golden authority label');
assert(!profilesSource.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'failed Visual-IK Ready generator must not be promoted');
assert(profilesSource.includes("targetWeapon: 'WeaponGrip'"), 'restored FPS-SWORD-UPPER bridge should still target WeaponGrip for the legacy source weapon track');

assert(fixed.artifact.schema === 'pose-lab-offline-pose-weapon-render-v1', 'fixed render should use canonical offline schema');
assert(fixed.artifact.ok === true, `accepted T-pose baseline should be green: ${JSON.stringify(fixed.artifact.checks)}`);
assert(fixed.artifact.generatedClipResolved === true, `accepted T-pose clip should resolve offline: ${fixed.artifact.generatedClipReason}`);
assert(fixed.artifact.checks?.weaponMeshRendered === true, 'offline baseline must render the real sabre mesh');
assert(fixed.artifact.checks?.parentChainMatchesPureFkShape === true, `offline baseline should keep model -> displayRoot -> WeaponGrip -> RightHand ownership: ${JSON.stringify(fixed.artifact.sampleData?.[0]?.parentChain)}`);
assert(fixed.artifact.checks?.appliedHiltPinnedToWeaponGrip === true, `applied hilt should stay pinned to WeaponGrip: ${JSON.stringify(fixed.artifact.hiltSocketDistances)}`);
assert(fixed.artifact.checks?.visibleMeshHiltPinnedToWeaponGrip === true, `real mesh hilt should stay near WeaponGrip: ${JSON.stringify(fixed.artifact.maxDistances)}`);
assert(fixed.artifact.checks?.visibleMeshHiltMatchesAppliedHilt === true, `real mesh hilt should match applied hilt: ${JSON.stringify(fixed.artifact.maxDistances)}`);
assert(fixed.artifact.checks?.appliedHiltInHandRegion === true, `applied hilt should stay in the visible hand region: ${JSON.stringify(fixed.artifact.maxDistances)}`);
assert(Number(fixed.artifact.maxDistances?.rawHandToAppliedHilt) <= Number(fixed.artifact.thresholds?.handRegionMaxDistance || 0.025), `raw hand to applied hilt distance should stay within restored baseline threshold: ${JSON.stringify(fixed.artifact.maxDistances)}`);
assert(Number(fixed.artifact.maxDistances?.visibleMeshBladeLength) >= Number(fixed.artifact.thresholds?.meshBladeLengthMinDistance || 0.005), `real sabre blade landmark should be visible: ${JSON.stringify(fixed.artifact.maxDistances)}`);
assert(fixed.artifact.reproducesLiveRed === false, `accepted T-pose baseline must not reproduce red-build class: ${JSON.stringify(fixed.artifact.maxLocalDrift)}`);

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['restored-tpose-weapon-baseline', 'no-failed-hand-fk-promotion', 'visible-real-sabre-hilt'],
  fixed: fixed.result.path,
}, null, 2));
