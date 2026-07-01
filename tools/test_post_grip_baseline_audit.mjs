import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(projectRoot, 'generated', 'test_runs', `post-grip-baseline-${process.pid}`);
const output = execFileSync('node', [
  path.join(projectRoot, 'tools', 'post_grip_baseline_audit.mjs'),
  '--out', outDir,
  '--max-render-frames', '5',
], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const dataPath = path.join(projectRoot, result.current);
const comparisonPath = path.join(projectRoot, result.comparison);
const tipPath = path.join(projectRoot, result.tipAudit);
const tipPngPath = path.join(projectRoot, result.tipOverlay);
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const tip = JSON.parse(fs.readFileSync(tipPath, 'utf8'));
const comparison = fs.readFileSync(comparisonPath, 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const tool = fs.readFileSync(path.join(projectRoot, 'tools', 'post_grip_baseline_audit.mjs'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(result.ok === true, 'post-grip baseline audit should complete');
assert(result.diagnosticOnly === true && result.productionBehaviorModified === false, 'audit must be diagnostic-only');
assert(fs.existsSync(dataPath), `missing current blade vector JSON ${dataPath}`);
assert(fs.existsSync(comparisonPath), `missing comparison report ${comparisonPath}`);
assert(fs.existsSync(tipPath), `missing tip landmark audit ${tipPath}`);
assert(fs.existsSync(tipPngPath), `missing tip landmark overlay ${tipPngPath}`);
assert(fs.statSync(tipPngPath).size > 1000, 'tip landmark overlay should not be empty');

assert(data.schema === 'pose-lab-meshy-blade-vector-workspace-v1', 'current data should be a blade vector workspace');
assert(data.productionBehaviorModified === false && data.diagnosticOnly === true, 'blade vector workspace must remain diagnostic-only');
assert(data.attachmentSnapshots?.fps?.attachment?.gripLocalPosition?.join(',') === '0.67888,-0.07803,-0.06249', 'FPS snapshot should preserve the semantic/manual hilt candidate');
assert(data.attachmentSnapshots?.meshy?.attachment?.gripLocalPosition?.join(',') === '0.69507,-0.02421,-0.06231', 'Meshy snapshot should preserve the rig-local hilt candidate');
assert(data.attachmentSnapshots?.fps?.attachment?.tipLocalPosition?.join(',') === '-0.95561,0.1368,0', 'FPS tip landmark should remain unchanged');
assert(data.attachmentSnapshots?.meshy?.attachment?.tipLocalPosition?.join(',') === '-0.95561,0.1368,0', 'Meshy tip landmark should remain unchanged');

for (const key of ['averageSocketError', 'maxSocketError', 'averagePickedGripError', 'maxPickedGripError', 'averageHiltLandmarkError', 'maxHiltLandmarkError', 'averageHiltError', 'maxHiltError', 'averageBladeDirectionErrorDeg', 'maxBladeDirectionErrorDeg', 'averageBladeLengthRatio', 'averageTipError', 'maxTipError']) {
  assert(Number.isFinite(result.currentSummary?.[key]), `current summary missing ${key}`);
  assert(result.comparisonRows.some((row) => row.key === key), `comparison rows missing ${key}`);
}
assert(comparison.includes('| Metric | Previous | Current | Delta | Status |'), 'comparison report should include before/after table');
assert(comparison.includes('Average socket error') && comparison.includes('Average picked grip error') && comparison.includes('Average hilt landmark error'), 'comparison should separate socket, picked grip, and hilt landmark errors');
assert(comparison.includes('Previous dominant class') && comparison.includes('Current dominant class'), 'comparison should include reclassification');
assert(['attachment placement', 'blade direction / attachment basis', 'blade landmark', 'blade length', 'animated socket divergence', 'mixed', 'blade landmark or blade length'].includes(result.dominantFailure), `unexpected dominant failure ${result.dominantFailure}`);
assert(['tip landmark', 'blade basis', 'blade length', 'animated socket rotation', 'attachment placement', 'mixed / inspect per-frame evidence'].includes(result.nextProductionTarget), `unexpected next target ${result.nextProductionTarget}`);

assert(tip.schema === 'pose-lab-post-grip-tip-landmark-audit-v1', 'tip audit schema should be explicit');
assert(tip.productionBehaviorModified === false && tip.diagnosticOnly === true, 'tip audit must be observational-only');
assert(Array.isArray(tip.configuredTipLocalPosition) && tip.configuredTipLocalPosition.join(',') === '-0.95561,0.1368,0', 'tip audit should measure unchanged configured tipLocalPosition');
assert(Array.isArray(tip.visibleBladeEndpoint) && tip.visibleBladeEndpoint.length === 3, 'tip audit should include visible blade endpoint');
assert(Number.isFinite(tip.distanceConfiguredToVisible), 'tip audit should include configured-to-visible distance');
assert(typeof tip.configuredPointOnPhysicalBladeEndpoint === 'boolean', 'tip audit should classify configured endpoint parity');

assert(profiles.includes('gripLocalPosition: [0.69507, -0.02421, -0.06231]'), 'audit must not replace the Meshy rig-local grip placement');
assert(profiles.includes('gripLocalPosition: [0.67888, -0.07803, -0.06249]'), 'audit must not replace the FPS manual/semantic grip placement');
assert(!profiles.includes('pose-lab-post-grip-baseline-audit-v1'), 'audit schema must not be wired into production profiles');
assert(!profiles.includes('post_grip_baseline'), 'audit must not edit production visibility/startup/aliases');
assert(!tool.includes('actor.info.weaponAttachment') && !tool.includes('startupClip:'), 'post-grip tool must not write runtime profile/startup fields');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['post-grip-current-baseline', 'comparison-report', 'tip-landmark-audit', 'accepted-grip-picks-preserved', 'diagnostic-only'],
  current: result.current,
  comparison: result.comparison,
  tipAudit: result.tipAudit,
  tipOverlay: result.tipOverlay,
  summary: result.currentSummary,
  dominantFailure: result.dominantFailure,
  nextProductionTarget: result.nextProductionTarget,
}, null, 2));
