import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(projectRoot, 'generated', 'test_runs', `projection-workspace-${process.pid}`);
const output = execFileSync('node', [
  path.join(projectRoot, 'tools', 'meshy_projection_workspace.mjs'),
  '--out', outDir,
  '--max-render-frames', '5',
], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const dataPath = path.join(projectRoot, result.data);
const pngPath = path.join(projectRoot, result.png);
const summaryPath = path.join(projectRoot, result.diagnosticSummary);
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(result.ok === true, 'projection workspace should complete');
assert(fs.existsSync(dataPath), `missing projection JSON ${dataPath}`);
assert(fs.existsSync(pngPath), `missing projection screenshot ${pngPath}`);
assert(fs.existsSync(summaryPath), `missing diagnostic summary ${summaryPath}`);
assert(fs.statSync(pngPath).size > 1000, 'projection screenshot should not be empty');
assert(data.schema === 'pose-lab-meshy-projection-workspace-v1', `unexpected schema ${data.schema}`);
assert(data.productionBehaviorModified === false && data.diagnosticOnly === true, 'workspace must be diagnostic-only');
assert(data.coordinateBridge?.targetBaseline === '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', 'workspace should use accepted Meshy/FPS calibration as target bridge');
assert(data.coordinateBridge?.rule?.includes('do not transfer quaternions'), 'coordinate bridge should document position projection policy');
assert(data.sourceKeyCount === 31, `OneHandReady authored key count should be 31, got ${data.sourceKeyCount}`);
assert(data.reports.projectedJointReport.length === data.sourceKeyCount * 8, 'projected joint report should include eight scoped joints for every source key');
assert(data.reports.actualJointReport.length === data.sourceKeyCount * 8, 'actual Meshy joint report should include eight scoped joints for every source key');
assert(data.reports.fkErrorReport.length === data.sourceKeyCount, 'FK error report should include every source key');
assert(data.reports.swordTipError.length === data.sourceKeyCount, 'sword landmark report should include every source key');
assert(data.reports.rollError.length === data.sourceKeyCount, 'roll error report should include every source key');
assert(data.reports.boneOrientationBasis.length >= 5, 'basis layer should include selected-bone orientation data');
assert(data.reports.boneOrientationBasis.every((entry) => entry.source.length === 8 && entry.target.length === 8), 'basis data should use selected FPS and Meshy bones only');
assert(data.reports.rollError.every((entry) => entry.errors.every((roll) => Number.isFinite(roll.errorDeg))), 'roll errors should be finite signed angles');
assert(Number.isFinite(data.summary.fkAvgError), 'FK summary error should be finite');
assert(Number.isFinite(data.summary.swordTipAvgError), 'sword tip summary error should be finite');
assert(Number.isFinite(data.summary.rollMaxAbsErrorDeg), 'roll summary error should be finite');
assert(data.layerMetrics?.fk?.byJoint?.length >= 6, 'output should include per-layer FK joint metrics');
assert(data.layerMetrics?.roll?.byBone?.length >= 2, 'output should include per-layer roll metrics');
assert(data.layerMetrics?.sword?.policy?.includes('observation-only'), 'sword should be measured as observation, not an arm solver');
assert(data.diagnostics?.findings?.length >= 4, 'output should include actionable diagnostic findings');
assert(data.diagnostics?.firstDivergenceLayer, 'output should name the first divergence layer');
assert((data.renderFrames || []).length >= 5, 'render frames should provide a visual review sheet');

const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'projection workspace must not modify Meshy startup baseline');
assert(!profiles.includes('PROJECTION-WORKSPACE'), 'projection workspace must not add production clip/profile labels');
assert(!profiles.includes('projection_workspace') && !profiles.includes('diagnosticSummary'), 'projection workspace must not wire production aliases or visibility fields');

const disabledOut = path.join(projectRoot, 'generated', 'test_runs', `projection-workspace-disabled-${process.pid}`);
const disabledOutput = execFileSync('node', [
  path.join(projectRoot, 'tools', 'meshy_projection_workspace.mjs'),
  '--out', disabledOut,
  '--enable', 'projected-pins,fk',
  '--max-render-frames', '2',
], { cwd: projectRoot, encoding: 'utf8' });
const disabled = JSON.parse(fs.readFileSync(path.join(projectRoot, JSON.parse(disabledOutput.slice(disabledOutput.indexOf('{'))).data), 'utf8'));
assert(disabled.toggles.fk === true && disabled.toggles.ik === false && disabled.toggles.sword === false && disabled.toggles.roll === false, 'layer toggles should be independent');
assert(disabled.reports.fkErrorReport.length === disabled.sourceKeyCount, 'enabled FK layer should report');
assert(disabled.reports.ikRefinementReport.length === 0 && disabled.reports.swordTipError.length === 0 && disabled.reports.rollError.length === 0, 'disabled IK/sword/roll layers should not report');
assert(disabled.reports.boneOrientationBasis.length === 0, 'disabled basis layer should not report selected-bone basis data');
assert(disabled.layerMetrics.roll.enabled === false && disabled.layerMetrics.roll.maxAbsErrorDeg === 0, 'roll can be disabled independently');
assert(disabled.layerMetrics.sword.enabled === false && disabled.layerMetrics.sword.avgTipError === 0, 'sword layer can be disabled independently');

const defaultModeOut = execFileSync('node', [
  path.join(projectRoot, 'tools', 'meshy_projection_workspace.mjs'),
  '--enable', 'projected-pins',
  '--max-render-frames', '1',
], { cwd: projectRoot, encoding: 'utf8' });
const defaultMode = JSON.parse(defaultModeOut.slice(defaultModeOut.indexOf('{')));
assert(defaultMode.data.includes('onehand_ready_projectedpins/projection_workspace.json'), 'bare --enable projected-pins should write a layer-specific output directory');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['projection-workspace-diagnostic-only', 'all-onehandready-keys', 'fk-sword-roll-reports', 'basis-data', 'independent-layer-toggles', 'layer-specific-output-dir'],
  data: result.data,
  png: result.png,
  diagnosticSummary: result.diagnosticSummary,
  summary: data.summary,
  diagnostics: data.diagnostics,
}, null, 2));
