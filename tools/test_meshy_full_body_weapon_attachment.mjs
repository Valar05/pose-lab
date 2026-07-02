import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const toolPath = path.join(projectRoot, 'tools', 'pose_lab_offline_render.mjs');
const out = path.join(projectRoot, 'generated', 'test_runs', `meshy-full-body-weapon-${process.pid}`);
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const sourceSabre = path.join(projectRoot, 'assets/source/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb');
const runtimeSabre = path.join(projectRoot, 'assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb');
assert(fs.existsSync(sourceSabre), 'source Meshy sabre GLB should be preserved');
assert(fs.existsSync(runtimeSabre), 'runtime Meshy sabre GLB should exist');

const output = execFileSync('node', [toolPath, '--out', out, '--samples', '3'], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const artifactPath = path.join(projectRoot, result.path);
const pngPath = path.join(projectRoot, result.png);
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

assert(fs.existsSync(artifactPath), `missing offline artifact ${artifactPath}`);
assert(fs.existsSync(pngPath), `missing offline render PNG ${pngPath}`);
assert(fs.statSync(pngPath).size > 1000, `offline render PNG should not be empty: ${pngPath}`);
assert(artifact.actor === 'meshyCharacter', `artifact should render Meshy Character, got ${artifact.actor}`);
assert(artifact.weaponAsset === 'assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb', `artifact should render the real Meshy sabre: ${artifact.weaponAsset}`);
assert(artifact.checks?.weaponMeshRendered === true, 'artifact should render the real sabre mesh point cloud');
assert(artifact.checks?.appliedHiltPinnedToWeaponGrip === true, `real sabre hilt should be pinned to WeaponGrip: ${JSON.stringify(artifact.hiltSocketDistances)}`);
assert(artifact.checks?.displayRootLocalStableUnderWeaponGrip === true, `display root should stay stable under WeaponGrip: ${JSON.stringify(artifact.maxLocalDrift)}`);
assert(artifact.checks?.weaponMeshLocalStableUnderDisplayRoot === true, `real weapon mesh should stay stable under display root: ${JSON.stringify(artifact.maxLocalDrift)}`);
assert(artifact.checks?.weaponGripDisplacedFromWeaponR === true, `WeaponGrip should be a displaced local child under WeaponR: ${JSON.stringify(artifact.maxDistances)}`);
assert(artifact.checks?.appliedHiltAwayFromRawHand === true, `hilt should not collapse onto wrist/hand: ${JSON.stringify(artifact.maxDistances)}`);
assert(artifact.checks?.weaponBladeDirectionMatchesFpsSource === true, `visible blade direction should match mapped FPS Weapon.R: ${JSON.stringify(artifact.maxWeaponOrientationErrorDeg)}`);
assert(artifact.sampleData?.every((sample) => Array.isArray(sample.weaponMesh) && sample.weaponMesh.length > 50), 'each sample should include real weapon mesh points');
assert(artifact.sampleData?.every((sample) => sample.weapon?.model && sample.weapon?.configuredGrip && sample.weapon?.appliedHilt && sample.weapon?.tip), 'each sample should include model, configured grip, applied hilt, and tip landmarks');
assert(artifact.sampleData?.every((sample) => sample.weaponPinning?.checks?.appliedHiltPinnedToSocket === true), 'shared pinning state should prove hilt-to-socket attachment each frame');
assert(artifact.ok === true, `full-body Meshy weapon attachment artifact should be green: ${JSON.stringify(artifact.checks)}`);

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['meshy-full-body-real-sabre-rendered', 'hilt-pinned-to-weapongrip', 'visible-displacement-preserved', 'blade-direction-parity'],
  artifact: result.path,
  png: result.png,
}, null, 2));
