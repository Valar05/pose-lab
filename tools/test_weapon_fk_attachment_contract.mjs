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

assert(profilesSource.includes('rotationDeg: [0, 0, 0]') && profilesSource.includes('rotationDeg: [-67.582, 76.718, -30.52]'), 'Meshy sabre rotation must preserve the accepted T-pose FK calibration on the mesh layer with identity WeaponGrip rotation');
assert(profilesSource.includes('modelLocalOffset: [1.01462, 12.80195, -0.47992]'), 'Meshy weapon proxy offset must match the accepted T-pose display baseline');
assert(profilesSource.includes('gripLocalPosition: [0.6535, -0.02302, -0.07317]'), 'Meshy sabre hilt oracle must match the accepted T-pose baseline');
assert(profilesSource.includes("parentMode: 'hand-fk'"), 'Meshy production profile must use direct hand-fk for boring FK verification');
assert(!profilesSource.includes("placementAuthority: 'manual-golden'"), 'Meshy production profile must not keep the failed manual-golden authority label');
assert(!profilesSource.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'failed Visual-IK Ready generator must not be promoted');
assert(!profilesSource.includes("clipTag: 'FPS-VISUAL-IK-READY'"), 'Ready-specific Visual-IK candidates must not be promoted; boring FK owns weapon follow');
assert(!profilesSource.includes("targetWeapon: 'WeaponGrip'") || profilesSource.includes('applyToHand: false'), 'FPS Weapon.R may be referenced only as source conversion data, never as a Meshy WeaponGrip driver');

assert(fixed.artifact.schema === 'pose-lab-offline-pose-weapon-render-v1', 'fixed render should use canonical offline schema');
assert(fixed.artifact.generatedClipResolved === true, `accepted T-pose clip should resolve offline: ${fixed.artifact.generatedClipReason}`);
assert(fixed.artifact.ok === true, `offline FK attachment visual verdict is red: ${fixed.artifact.actualVisibleRead}\n${JSON.stringify(fixed.artifact.checks, null, 2)}`);
assert(fixed.artifact.checks?.weaponMeshRendered === true, 'offline baseline must render the real sabre mesh');
assert(fixed.artifact.checks?.parentChainMatchesPureFkShape === true, `offline baseline should keep model -> displayRoot -> WeaponGrip -> RightHand ownership: ${JSON.stringify(fixed.artifact.sampleData?.[0]?.parentChain)}`);
assert(fixed.artifact.checks?.appliedHiltPinnedToWeaponGrip === true, `applied hilt should stay pinned to WeaponGrip: ${JSON.stringify(fixed.artifact.hiltSocketDistances)}`);
assert(fixed.artifact.checks?.appliedHiltAwayFromRawHandLocal === true, `boring FK calibration should keep the applied hilt visibly displaced from the raw wrist: ${JSON.stringify(fixed.artifact.maxLocalDistances)}`);
assert(Number(fixed.artifact.maxLocalDistances?.rawHandToAppliedHilt) >= Number(fixed.artifact.thresholds?.localAuthoredDisplacementMinDistance || 0.04), `applied hilt should preserve a human-visible hand-local grip offset: ${JSON.stringify(fixed.artifact.maxLocalDistances)}`);
assert(Number(fixed.artifact.maxDistances?.visibleMeshBladeLength) >= Number(fixed.artifact.thresholds?.meshBladeLengthMinDistance || 0.005), `real sabre blade landmark should be visible: ${JSON.stringify(fixed.artifact.maxDistances)}`);
assert(fixed.artifact.generatedClipStats?.weaponTrackEnabled !== true && fixed.artifact.generatedClipStats?.weaponTrackTarget == null, `accepted T-pose baseline must not emit generated weapon tracks: ${JSON.stringify(fixed.artifact.generatedClipStats)}`);

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['diagnostic-tpose-weapon-baseline', 'direct-hand-fk-required', 'visible-real-sabre-mesh'],
  fixed: fixed.result.path,
}, null, 2));
