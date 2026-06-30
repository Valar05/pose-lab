import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(projectRoot, 'generated', 'test_runs', `blade-vector-workspace-${process.pid}`);
const output = execFileSync('node', [
  path.join(projectRoot, 'tools', 'meshy_blade_vector_workspace.mjs'),
  '--out', outDir,
  '--max-render-frames', '5',
], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const dataPath = path.join(projectRoot, result.data);
const pngPath = path.join(projectRoot, result.png);
const summaryPath = path.join(projectRoot, result.diagnosticSummary);
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(result.ok === true, 'blade vector workspace should complete');
assert(fs.existsSync(dataPath), `missing blade vector JSON ${dataPath}`);
assert(fs.existsSync(pngPath), `missing blade vector PNG ${pngPath}`);
assert(fs.existsSync(summaryPath), `missing blade vector diagnostic summary ${summaryPath}`);
assert(fs.statSync(pngPath).size > 1000, 'blade vector screenshot should not be empty');
assert(data.schema === 'pose-lab-meshy-blade-vector-workspace-v1', `unexpected schema ${data.schema}`);
assert(data.productionBehaviorModified === false && data.diagnosticOnly === true, 'workspace must be diagnostic-only');
assert(data.coordinateBridge?.targetBaseline === '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', 'workspace should use accepted Meshy/FPS calibration as target bridge');
assert(data.coordinateBridge?.policy?.includes('no IK, no roll, no retarget mutation'), 'workspace should document arm/roll quarantine policy');
assert(data.sourceKeyCount === 31, `OneHandReady authored key count should be 31, got ${data.sourceKeyCount}`);
assert(data.reports?.perFrame?.length === data.sourceKeyCount, 'per-frame report should include every authored key');
for (const frame of data.reports.perFrame) {
  for (const key of ['socketError', 'socketGripDistance', 'pickedGripError', 'hiltLandmarkError', 'hiltDistance', 'fpsBladeLength', 'meshyBladeLength', 'bladeLengthRatio', 'bladeDirectionAngleDeg', 'tipDistance']) {
    assert(Number.isFinite(frame[key]), `frame ${frame.index} missing finite ${key}`);
  }
  assert(typeof frame.classification === 'string' && frame.classification.length > 0, `frame ${frame.index} missing classification`);
  assert(Array.isArray(frame.fpsHilt) && Array.isArray(frame.fpsTip) && Array.isArray(frame.meshyHilt) && Array.isArray(frame.meshyTip), `frame ${frame.index} missing render vectors`);
}
for (const key of ['averageSocketError', 'averageSocketGripError', 'averagePickedGripError', 'averageHiltLandmarkError', 'averageHiltError', 'averageBladeDirectionErrorDeg', 'averageBladeLengthRatio', 'averageTipError']) {
  assert(Number.isFinite(data.summary?.[key]), `summary missing finite ${key}`);
}
assert(data.summary?.dominantClass, 'summary should include dominant failure class');
assert(data.summary?.recommendation, 'summary should include single next production recommendation');
assert(Object.values(data.summary?.classificationCounts || {}).reduce((sum, count) => sum + count, 0) === data.sourceKeyCount, 'classification counts should cover every frame');
assert(data.attachmentSnapshots?.fps?.attachment?.rotationDeg?.join(',') === '178.343,4.512,109.315', 'FPS snapshot should use current accepted saber rotation');
assert(data.attachmentSnapshots?.fps?.proxy?.modelLocalOffset?.join(',') === '0.06126,-0.07096,-0.00135', 'FPS snapshot should use current accepted saber offset');
assert((data.renderFrames || []).length >= 5, 'render frames should provide a visual review sheet');
assert(fs.readFileSync(summaryPath, 'utf8').includes('Dominant failure class'), 'diagnostic summary should report dominant class');

assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'blade workspace must not modify Meshy startup baseline');
assert(!profiles.includes('BLADE-VECTOR-WORKSPACE'), 'blade workspace must not add production clip/profile labels');
assert(!profiles.includes('blade_vector_workspace') && !profiles.includes('pose-lab-meshy-blade-vector-workspace-v1'), 'blade workspace must not wire production aliases or visibility fields');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['blade-vector-workspace-diagnostic-only', 'all-onehandready-keys', 'per-frame-blade-metrics', 'classification', 'visual-artifact'],
  data: result.data,
  png: result.png,
  diagnosticSummary: result.diagnosticSummary,
  summary: data.summary,
}, null, 2));
