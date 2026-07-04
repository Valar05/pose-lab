import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const emptyOut = path.join(projectRoot, 'generated', 'test_runs', `semantic-landmark-empty-${process.pid}`);
const pickedOut = path.join(projectRoot, 'generated', 'test_runs', `semantic-landmark-picked-${process.pid}`);
const emptyOutput = execFileSync('node', [
  path.join(projectRoot, 'tools', 'semantic_landmark_calibration.mjs'),
  '--out', emptyOut,
  '--actor', 'player',
], { cwd: projectRoot, encoding: 'utf8' });
const pickedOutput = execFileSync('node', [
  path.join(projectRoot, 'tools', 'semantic_landmark_calibration.mjs'),
  '--out', pickedOut,
  '--actor', 'player',
  '--pick-from-bounds',
], { cwd: projectRoot, encoding: 'utf8' });

const emptyResult = JSON.parse(emptyOutput.slice(emptyOutput.indexOf('{')));
const pickedResult = JSON.parse(pickedOutput.slice(pickedOutput.indexOf('{')));
const emptyData = JSON.parse(fs.readFileSync(path.join(projectRoot, emptyResult.data), 'utf8'));
const pickedData = JSON.parse(fs.readFileSync(path.join(projectRoot, pickedResult.data), 'utf8'));
const poseLab = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const tool = fs.readFileSync(path.join(projectRoot, 'tools', 'semantic_landmark_calibration.mjs'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(emptyResult.ok === true && pickedResult.ok === true, 'semantic landmark calibration commands should complete');
for (const result of [emptyResult, pickedResult]) {
  assert(fs.existsSync(path.join(projectRoot, result.data)), `missing data ${result.data}`);
  assert(fs.existsSync(path.join(projectRoot, result.png)), `missing png ${result.png}`);
  assert(fs.existsSync(path.join(projectRoot, result.summary)), `missing summary ${result.summary}`);
  assert(fs.statSync(path.join(projectRoot, result.png)).size > 1000, 'overlay should not be empty');
}

assert(emptyData.schema === 'pose-lab-semantic-weapon-landmark-calibration-v1', 'unexpected empty calibration schema');
assert(pickedData.schema === 'pose-lab-semantic-weapon-landmark-calibration-v1', 'unexpected picked calibration schema');
assert(emptyData.candidateOnly === true && emptyData.productionBehaviorModified === false, 'empty calibration must be candidate-only');
assert(pickedData.candidateOnly === true && pickedData.productionBehaviorModified === false, 'picked calibration must be candidate-only');
assert(emptyData.candidate.complete === false, 'no-pick calibration should remain incomplete');
assert(emptyData.candidate.gripLocalPosition === null && emptyData.candidate.tipLocalPosition === null, 'no-pick calibration should not invent candidate values');
assert(pickedData.candidate.complete === true, 'pick-from-bounds calibration should produce a complete candidate');
assert(Array.isArray(pickedData.candidate.gripLocalPosition) && pickedData.candidate.gripLocalPosition.length === 3, 'picked hilt candidate should be vec3');
assert(Array.isArray(pickedData.candidate.tipLocalPosition) && pickedData.candidate.tipLocalPosition.length === 3, 'picked tip candidate should be vec3');
assert(pickedData.candidate.hilt?.nearestVertexDistance === 0, 'synthetic hilt pick should round-trip to a mesh vertex');
assert(pickedData.candidate.tip?.nearestVertexDistance === 0, 'synthetic tip pick should round-trip to a mesh vertex');
assert(Array.isArray(pickedData.meshPoints) && pickedData.meshPoints.length > 10, 'overlay should include sampled mesh points');

assert(poseLab.includes('pose-lab-semantic-weapon-landmark-candidate-v1'), 'Pose Lab should expose semantic candidate export schema');
assert(poseLab.includes('pickSemanticWeaponLandmark'), 'Pose Lab should include semantic mesh picking');
assert(poseLab.includes('worldToLocal(hit.point.clone())'), 'semantic picks should convert visible mesh point into weapon-local landmark values');
assert(poseLab.includes('SEMANTIC_LANDMARK_KEY'), 'semantic candidate should save to a separate localStorage key');
assert(poseLab.includes('forceSelectedWeaponVisibleForTooling'), 'weapon tooling should force the selected weapon proxy visible');
assert(poseLab.includes('selectedRealWeapon'), 'selected real weapon attachments should remain visible instead of depending only on clip-name gates');
assert(poseLab.includes("this.activePanel === 'weapon'"), 'Weapon panel should keep the actual weapon mesh visible for calibration');
assert(poseLab.includes('proxy.root.visible = true'), 'tooling visibility override should unhide the actual weapon proxy root');
assert(!poseLab.includes('semanticLandmarkCandidate.gripLocalPosition'), 'semantic candidate should not be assigned as production attachment values');
assert(!tool.includes("fs.writeFileSync(path.join(projectRoot, 'src'"), 'semantic tool must not write production source files');
assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'semantic calibration must not change accepted Meshy baseline');
assert(!profiles.includes('pose-lab-semantic-weapon-landmark-candidate-v1'), 'semantic candidate schema must not be wired into production profile');
assert(!profiles.includes('semantic_landmark_calibration'), 'semantic calibration must not edit profile visibility or aliases');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: [
    'candidate-only-ui-schema',
    'no-pick-incomplete-artifact',
    'synthetic-mesh-pick-roundtrip',
    'actual-mesh-overlay',
    'no-production-profile-wiring',
  ],
  empty: emptyResult.data,
  picked: pickedResult.data,
  candidate: pickedData.candidate,
}, null, 2));
