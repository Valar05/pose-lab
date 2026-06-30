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
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(result.ok === true, 'projection workspace should complete');
assert(fs.existsSync(dataPath), `missing projection JSON ${dataPath}`);
assert(fs.existsSync(pngPath), `missing projection screenshot ${pngPath}`);
assert(fs.statSync(pngPath).size > 1000, 'projection screenshot should not be empty');
assert(data.schema === 'pose-lab-meshy-projection-workspace-v1', `unexpected schema ${data.schema}`);
assert(data.productionBehaviorModified === false && data.diagnosticOnly === true, 'workspace must be diagnostic-only');
assert(data.coordinateBridge?.targetBaseline === '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', 'workspace should use accepted Meshy/FPS calibration as target bridge');
assert(data.coordinateBridge?.rule?.includes('do not transfer quaternions'), 'coordinate bridge should document position projection policy');
assert(data.sourceKeyCount === 31, `OneHandReady authored key count should be 31, got ${data.sourceKeyCount}`);
assert(data.reports.projectedJointReport.length === data.sourceKeyCount * 8, 'projected joint report should include eight scoped joints for every source key');
assert(data.reports.fkErrorReport.length === data.sourceKeyCount, 'FK error report should include every source key');
assert(data.reports.swordTipError.length === data.sourceKeyCount, 'sword landmark report should include every source key');
assert(data.reports.rollError.length === data.sourceKeyCount, 'roll error report should include every source key');
assert(data.reports.rollError.every((entry) => entry.errors.every((roll) => Number.isFinite(roll.errorDeg))), 'roll errors should be finite signed angles');
assert(Number.isFinite(data.summary.fkAvgError), 'FK summary error should be finite');
assert(Number.isFinite(data.summary.swordTipAvgError), 'sword tip summary error should be finite');
assert(Number.isFinite(data.summary.rollMaxAbsErrorDeg), 'roll summary error should be finite');
assert((data.renderFrames || []).length >= 5, 'render frames should provide a visual review sheet');

const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'projection workspace must not modify Meshy startup baseline');
assert(!profiles.includes('PROJECTION-WORKSPACE'), 'projection workspace must not add production clip/profile labels');

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

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['projection-workspace-diagnostic-only', 'all-onehandready-keys', 'fk-sword-roll-reports', 'independent-layer-toggles'],
  data: result.data,
  png: result.png,
  summary: data.summary,
}, null, 2));
