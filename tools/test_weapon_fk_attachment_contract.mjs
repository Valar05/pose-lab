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

assert(profilesSource.includes('rotationDeg: [-67.582, 76.718, -0.52]'), 'Meshy sabre rotation must match the user-authored shared FK calibration');
assert(profilesSource.includes('gripLocalPosition: [0.6535, -0.02302, -0.07317]'), 'Meshy sabre hilt oracle must match the accepted pre-FK T-pose baseline');
assert(profilesSource.includes("parentMode: 'hand-fk'"), 'Meshy production profile must use direct hand-fk for boring FK verification');
assert(!profilesSource.includes("placementAuthority: 'manual-golden'"), 'Meshy production profile must not keep the failed manual-golden authority label');
assert(!profilesSource.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'failed Visual-IK Ready generator must not be promoted');
assert(!profilesSource.includes("targetWeapon: 'WeaponGrip'") && !profilesSource.includes("targetWeapon: 'WeaponR'"), 'Ready candidates must not target WeaponGrip or WeaponR; boring FK owns weapon follow');

assert(fixed.artifact.schema === 'pose-lab-offline-pose-weapon-render-v1', 'fixed render should use canonical offline schema');
assert(fixed.artifact.generatedClipResolved === true, `accepted T-pose clip should resolve offline: ${fixed.artifact.generatedClipReason}`);
assert(fixed.artifact.checks?.weaponMeshRendered === true, 'offline baseline must render the real sabre mesh');
assert(fixed.artifact.checks?.parentChainMatchesPureFkShape === true, `offline baseline should keep model -> displayRoot -> WeaponGrip -> RightHand ownership: ${JSON.stringify(fixed.artifact.sampleData?.[0]?.parentChain)}`);
assert(fixed.artifact.checks?.appliedHiltPinnedToWeaponGrip === true, `applied hilt should stay pinned to WeaponGrip: ${JSON.stringify(fixed.artifact.hiltSocketDistances)}`);
assert(Number(fixed.artifact.maxDistances?.rawHandToAppliedHilt) >= 0.12, `manual shared FK calibration should keep the hilt visibly displaced from the raw wrist/hand origin: ${JSON.stringify(fixed.artifact.maxDistances)}`);
assert(Number(fixed.artifact.maxDistances?.palmTargetToAppliedHilt) >= 0.12, `manual shared FK calibration should preserve the authored palm/hilt displacement instead of collapsing to the old palm target: ${JSON.stringify(fixed.artifact.maxDistances)}`);
assert(Number(fixed.artifact.maxDistances?.visibleMeshBladeLength) >= Number(fixed.artifact.thresholds?.meshBladeLengthMinDistance || 0.005), `real sabre blade landmark should be visible: ${JSON.stringify(fixed.artifact.maxDistances)}`);
assert(fixed.artifact.generatedClipStats?.weaponTrackEnabled !== true && fixed.artifact.generatedClipStats?.weaponTrackTarget == null, `accepted T-pose baseline must not emit generated weapon tracks: ${JSON.stringify(fixed.artifact.generatedClipStats)}`);

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['diagnostic-tpose-weapon-baseline', 'direct-hand-fk-required', 'visible-real-sabre-mesh'],
  fixed: fixed.result.path,
}, null, 2));
