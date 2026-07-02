import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(projectRoot, 'generated', 'test_runs', `socket-solver-${process.pid}`);
const output = execFileSync('node', [
  path.join(projectRoot, 'tools', 'socket_solver.mjs'),
  '--out', outDir,
  '--max-render-frames', '5',
], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const dataPath = path.join(projectRoot, result.data);
const candidatePath = path.join(projectRoot, result.candidate);
const pngPath = path.join(projectRoot, result.png);
const summaryPath = path.join(projectRoot, result.diagnosticSummary);
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const tool = fs.readFileSync(path.join(projectRoot, 'tools', 'socket_solver.mjs'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(result.ok === true, 'socket solver should complete');
assert(fs.existsSync(dataPath), `missing socket solver JSON ${dataPath}`);
assert(fs.existsSync(candidatePath), `missing socket candidate JSON ${candidatePath}`);
assert(fs.existsSync(pngPath), `missing socket overlay ${pngPath}`);
assert(fs.existsSync(summaryPath), `missing diagnostic summary ${summaryPath}`);
assert(fs.statSync(pngPath).size > 1000, 'socket overlay should not be empty');
assert(data.schema === 'pose-lab-weapon-grip-socket-solver-v1', `unexpected schema ${data.schema}`);
assert(data.diagnosticOnly === true && data.productionBehaviorModified === false, 'solver must be diagnostic-only');
assert(data.source?.sourceKeyCount === 31, `solver should measure all 31 authored keys, got ${data.source?.sourceKeyCount}`);
assert((data.reports?.perFrame || []).length === 31, 'per-frame solver report should include all authored keys');
assert((data.reports?.predictedWithAverageCorrection || []).length === 31, 'prediction report should include all authored keys');

for (const frame of data.reports.perFrame || []) {
  for (const key of ['projectedGripTargetWorld', 'currentSocketWorld', 'currentGripWorld', 'socketToProjectedTarget', 'attachmentGripToProjectedTarget', 'attachmentGripToSocket', 'socketParentLocalCorrection']) {
    assert(Array.isArray(frame[key]) && frame[key].length === 3, `frame ${frame.index} missing ${key}`);
  }
  for (const key of ['socketError', 'pickedGripError', 'hiltLandmarkError']) {
    assert(Number.isFinite(frame.before?.[key]), `frame ${frame.index} missing before ${key}`);
  }
}

for (const key of ['averageCorrection', 'maxDeviation', 'standardDeviation']) {
  assert(data.summary?.[key] != null, `summary missing ${key}`);
}
assert(Number.isFinite(data.summary?.before?.averagePickedGripError), 'summary missing before average picked grip error');
assert(Number.isFinite(data.summary?.after?.averagePickedGripError), 'summary missing after average picked grip error');
assert(candidate.diagnosticOnly === true && candidate.productionBehaviorModified === false, 'candidate must be diagnostic-only');
assert(candidate.manualPlacementLock?.locked === true, 'manual placement lock should be embedded in socket candidate output');
assert(candidate.promotable === false, 'socket solver must not mark manual placement overrides as promotable');
assert(candidate.productionSnippet === null, 'socket solver must not emit production snippets for locked manual placement fields');
assert(Array.isArray(candidate.averageSocketLocalCorrection) && candidate.averageSocketLocalCorrection.length === 3, 'candidate should include average socket local correction');
assert(Array.isArray(candidate.currentModelLocalOffset) && candidate.currentModelLocalOffset.length === 3, 'candidate should include current modelLocalOffset');
assert(candidate.candidateModelLocalOffset === null && candidate.replacementModelLocalOffsetOmitted === true, 'solver must omit production-shaped replacement modelLocalOffset values');
assert(candidate.rotationAdjustmentReportedOnly?.requiredByEvidence === false, 'solver should not propose socket rotation');

assert(data.source?.attachmentSnapshots?.fps?.attachment?.gripLocalPosition?.join(',') === '0.67888,-0.07803,-0.06249', 'FPS snapshot should preserve the semantic/manual hilt candidate');
assert(data.source?.attachmentSnapshots?.meshy?.attachment?.gripLocalPosition?.join(',') === '0.6535,-0.02302,-0.07317', 'Meshy snapshot should preserve the rig-local hilt candidate');
assert(data.source?.attachmentSnapshots?.fps?.attachment?.tipLocalPosition?.join(',') === '-0.95561,0.1368,0', 'FPS tip landmark should remain unchanged');
assert(data.source?.attachmentSnapshots?.meshy?.attachment?.tipLocalPosition?.join(',') === '-0.95561,0.1368,0', 'Meshy tip landmark should remain unchanged');

assert(profiles.includes('gripLocalPosition: [0.6535, -0.02302, -0.07317]'), 'solver must not replace the Meshy rig-local grip placement');
assert(profiles.includes('gripLocalPosition: [0.67888, -0.07803, -0.06249]'), 'solver must not replace the FPS manual/semantic grip placement');
assert(!profiles.includes('pose-lab-weapon-grip-socket-solver-v1'), 'solver schema must not be wired into production profiles');
assert(!profiles.includes('socket_solver'), 'solver must not edit production startup/aliases/visibility');
assert(!tool.includes("writeFileSync(path.join(projectRoot, 'src'") && !tool.includes('writeFileSync(path.join(projectRoot, "src"'), 'solver must not write production profile source');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['socket-solver-diagnostic-only', 'all-onehandready-keys', 'constant-correction-stats', 'candidate-only', 'accepted-landmarks-preserved'],
  data: result.data,
  candidate: result.candidate,
  png: result.png,
  diagnosticSummary: result.diagnosticSummary,
  summary: data.summary,
  promotable: candidate.promotable,
  candidateModelLocalOffset: candidate.candidateModelLocalOffset,
}, null, 2));
