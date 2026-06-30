import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(projectRoot, 'generated', 'test_runs', `weapon-basis-workspace-${process.pid}`);
const output = execFileSync('node', [
  path.join(projectRoot, 'tools', 'meshy_weapon_basis_workspace.mjs'),
  '--out', outDir,
], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const data = JSON.parse(fs.readFileSync(path.join(projectRoot, result.data), 'utf8'));
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(result.ok === true, 'weapon basis workspace should complete');
assert(fs.existsSync(path.join(projectRoot, result.png)), 'weapon basis PNG should exist');
assert(fs.existsSync(path.join(projectRoot, result.diagnosticSummary)), 'weapon basis summary should exist');
assert(data.schema === 'pose-lab-meshy-weapon-basis-workspace-v1', `unexpected schema ${data.schema}`);
assert(data.diagnosticOnly === true && data.productionBehaviorModified === false, 'workspace must be diagnostic-only');
assert(data.coordinateBridge.targetBaseline === '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', 'workspace should use accepted calibration');
assert(data.coordinateBridge.fkPolicy.includes('no IK') && data.coordinateBridge.fkPolicy.includes('no roll correction'), 'workspace must quarantine IK/roll');
assert(data.sourceKeyCount === 31, `workspace should preserve 31 OneHandReady keys, got ${data.sourceKeyCount}`);
for (const layer of ['grip-position', 'grip-orientation', 'blade-axis', 'blade-tip', 'attachment-rotation', 'attachment-local-basis', 'attachment-scale']) {
  assert(data.layers[layer] === true, `default layer should be enabled: ${layer}`);
}
assert(data.metrics.current.avgBladeAxisErrorDeg > 30, 'current attachment basis should show large blade-axis error');
assert(data.metrics.current.avgGripPositionError > 0.25, 'workspace should expose FPS-projected grip mismatch separately');
assert(data.metrics.rotationOnly.avgBladeAxisErrorDeg <= 1, 'rotation-only experiment should isolate blade-axis correction');
assert(data.metrics.rotationOnly.avgSocketRelativeTipError < data.metrics.current.avgSocketRelativeTipError, 'rotation-only should reduce socket-relative tip error');
assert(data.metrics.positionOnly.avgBladeAxisErrorDeg === data.metrics.current.avgBladeAxisErrorDeg, 'position-only must not hide basis error');
assert(data.metrics.scaleOnly.avgBladeAxisErrorDeg === data.metrics.current.avgBladeAxisErrorDeg, 'scale-only must not hide basis error');
assert(data.diagnostics.dominantCause.includes('target-grip-mismatch-plus-attachment-basis'), 'dominant cause should distinguish target mismatch from local basis');
assert(data.diagnostics.findings.some((line) => line.includes('not automatically a bad Meshy hand grip')), 'diagnostic should respect Meshy hand attachment caveat');

const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const runtime = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
assert(!profiles.includes('weapon_basis_workspace') && !runtime.includes('weapon_basis_workspace'), 'workspace must not be wired into production profile/runtime');
assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'accepted Meshy startup baseline must remain protected');

const disabledOut = path.join(projectRoot, 'generated', 'test_runs', `weapon-basis-disabled-${process.pid}`);
const disabledOutput = execFileSync('node', [
  path.join(projectRoot, 'tools', 'meshy_weapon_basis_workspace.mjs'),
  '--out', disabledOut,
  '--enable', 'grip-position,blade-axis',
], { cwd: projectRoot, encoding: 'utf8' });
const disabled = JSON.parse(fs.readFileSync(path.join(projectRoot, JSON.parse(disabledOutput.slice(disabledOutput.indexOf('{'))).data), 'utf8'));
assert(disabled.layers['grip-position'] === true && disabled.layers['blade-axis'] === true, 'selected layers should enable');
assert(disabled.layers['blade-tip'] === false && disabled.layers['attachment-rotation'] === false, 'unselected layers should disable independently');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['weapon-basis-diagnostic-only', 'socket-relative-basis-metrics', 'independent-layer-toggles', 'production-settings-protected'],
  data: result.data,
  png: result.png,
  diagnosticSummary: result.diagnosticSummary,
  dominantCause: data.diagnostics.dominantCause,
  metrics: data.metrics.current,
}, null, 2));
