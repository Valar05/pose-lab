import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const rendererPath = path.join(projectRoot, 'tools', 'pose_lab_offline_render.mjs');
const clip = '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]';
const out = path.join(projectRoot, 'generated', 'test_runs', `offline-tpose-weapon-orientation-${process.pid}`);
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const output = execFileSync('node', [rendererPath, '--actor', 'meshyCharacter', '--clip', clip, '--samples', '2', '--out', out], {
  cwd: projectRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
const result = JSON.parse(output.slice(output.indexOf('{')));
const artifactPath = path.join(projectRoot, result.path);
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

assert(artifact.clipRequested === clip, `T-pose orientation test rendered the wrong clip: ${artifact.clipRequested}`);
assert(artifact.generatedClipResolved === true, `T-pose must be rebuilt offline instead of falling back to a Meshy GLB clip: ${JSON.stringify(artifact.generatedClipStats)}`);
assert(artifact.clipApplied === clip, `offline renderer applied ${artifact.clipApplied} instead of the requested generated T-pose clip`);
assert(artifact.generatedClipStats?.sourceKeyCount === 1 && artifact.generatedClipStats?.targetKeyCount === 1, `T-pose should resolve as the single-key FPS rest pose: ${JSON.stringify(artifact.generatedClipStats)}`);
assert(artifact.generatedClipStats?.weaponTrackEnabled === true && artifact.generatedClipStats?.weaponTrackTarget === 'WeaponR', `T-pose should synthesize a WeaponR socket from FPS Weapon.R rest pose: ${JSON.stringify(artifact.generatedClipStats)}`);
assert(artifact.checks?.weaponOrientationComparedToFpsSource === true, `T-pose evidence must compare visible blade direction to FPS Weapon.R: ${JSON.stringify(artifact.maxWeaponOrientationErrorDeg)}`);
assert(artifact.checks?.weaponBladeDirectionMatchesFpsSource === true, `T-pose visible blade should match mapped FPS Weapon.R: ${JSON.stringify(artifact.maxWeaponOrientationErrorDeg)}`);
assert(artifact.checks?.weaponMeshRendered === true, 'T-pose renderer must render the real sabre mesh, not only markers');
assert(artifact.checks?.appliedHiltPinnedToWeaponGrip === true, `T-pose hilt must remain pinned to WeaponGrip: ${JSON.stringify(artifact.hiltSocketDistances)}`);
assert(artifact.checks?.palmTargetDistanceFinite === true, `T-pose artifact must report palm/hand-region distance instead of hiding it: ${JSON.stringify(artifact.maxDistances)}`);
assert(Number.isFinite(artifact.maxDistances?.palmTargetToAppliedHilt), `T-pose artifact missing visible hand-region distance: ${JSON.stringify(artifact.maxDistances)}`);
assert(String(artifact.actualVisibleRead || '').includes('generated Pose Lab clip'), `artifact should explicitly say the generated T-pose clip was resolved, got: ${artifact.actualVisibleRead}`);

if (failures.length) {
  throw new Error(failures.join('\n'));
}

console.log(JSON.stringify({
  checked: 'meshy-tpose-weapon-orientation',
  artifact: result.path,
  clip,
  maxWeaponOrientationErrorDeg: artifact.maxWeaponOrientationErrorDeg,
}, null, 2));
