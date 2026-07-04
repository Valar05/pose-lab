import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(projectRoot, 'generated', 'test_runs', `metric-landmark-audit-${process.pid}`);
const output = execFileSync('node', [
  path.join(projectRoot, 'tools', 'metric_landmark_audit.mjs'),
  '--out', outDir,
  '--max-render-frames', '5',
  '--mesh-sample-stride', '48',
], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const dataPath = path.join(projectRoot, result.data);
const pngPath = path.join(projectRoot, result.png);
const tracePath = path.join(projectRoot, result.transformTrace);
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const bladeWorkspace = fs.readFileSync(path.join(projectRoot, 'tools', 'meshy_blade_vector_workspace.mjs'), 'utf8');
const auditTool = fs.readFileSync(path.join(projectRoot, 'tools', 'metric_landmark_audit.mjs'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(result.ok === true, 'metric landmark audit should complete');
assert(fs.existsSync(dataPath), `missing metric landmark JSON ${dataPath}`);
assert(fs.existsSync(pngPath), `missing metric landmark overlay ${pngPath}`);
assert(fs.existsSync(tracePath), `missing transform trace ${tracePath}`);
assert(fs.statSync(pngPath).size > 1000, 'metric landmark overlay should not be empty');
assert(fs.statSync(tracePath).size > 1000, 'transform trace should not be empty');
assert(data.schema === 'pose-lab-metric-landmark-audit-v1', `unexpected schema ${data.schema}`);
assert(data.diagnosticOnly === true, 'audit must be diagnostic-only');
assert(data.productionBehaviorModified === false, 'audit must not modify production behavior');
assert(data.noCorrectiveSolver === true, 'audit must not include corrective solver');
assert(data.noAttachmentTuning === true, 'audit must not tune attachment offsets');
assert(data.coordinateBridge?.policy?.includes('audit landmark measurement'), 'audit should document marker parity policy');
assert(data.coordinateBridge?.targetBaseline === '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', 'audit should use accepted calibration as context');
assert(data.sourceKeyCount === 31, `OneHandReady authored key count should be 31, got ${data.sourceKeyCount}`);
assert(data.reports?.perFrame?.length === data.sourceKeyCount, 'per-frame report should include every authored key');
assert(data.summary?.semanticLandmarkReviewRequired === true, 'audit should require visual semantic landmark review even after marker parity');
assert(Number.isFinite(data.summary?.maxMetricVsMarkerDistance), 'summary should include max metric-vs-marker distance');
assert((data.renderFrames || []).length >= 5, 'overlay should include sampled render frames');

for (const actor of ['fps', 'meshy']) {
  assert(typeof data.summary?.byActor?.[actor]?.hiltExact === 'boolean', `${actor} summary missing hilt parity boolean`);
  assert(typeof data.summary?.byActor?.[actor]?.tipExact === 'boolean', `${actor} summary missing tip parity boolean`);
  for (const frame of data.reports.perFrame || []) {
    const entry = frame[actor];
    assert(entry, `frame ${frame.index} missing ${actor} entry`);
    for (const landmark of ['hilt', 'tip']) {
      assert(Array.isArray(entry?.[landmark]?.metricWorld), `${actor} frame ${frame.index} ${landmark} missing metricWorld`);
      assert(Array.isArray(entry?.[landmark]?.renderedWorld), `${actor} frame ${frame.index} ${landmark} missing renderedWorld`);
      assert(Number.isFinite(entry?.[landmark]?.distance), `${actor} frame ${frame.index} ${landmark} missing parity distance`);
      assert(Array.isArray(entry?.[landmark]?.trace) && entry[landmark].trace.length >= 4, `${actor} frame ${frame.index} ${landmark} missing transform trace`);
    }
    assert(entry.parentAudit?.hiltParent, `${actor} frame ${frame.index} missing hilt parent audit`);
    assert(entry.parentAudit?.tipParent, `${actor} frame ${frame.index} missing tip parent audit`);
    assert(Array.isArray(entry.meshPoints) && entry.meshPoints.length > 0, `${actor} frame ${frame.index} missing actual mesh points for overlay`);
  }
}

if (data.summary?.firstDivergence) {
  assert(data.summary.firstDivergence.frame >= 0, 'first divergence should identify frame');
  assert(['fps', 'meshy'].includes(data.summary.firstDivergence.actor), 'first divergence should identify actor');
  assert(['hilt', 'tip'].includes(data.summary.firstDivergence.landmark), 'first divergence should identify landmark');
  assert(data.summary.stopReason?.includes('do not trust downstream'), 'failed parity should stop downstream metrics');
} else {
  assert(data.summary?.metricTrustworthy === true, 'no divergence should mark metricTrustworthy true');
}

const trace = fs.readFileSync(tracePath, 'utf8');
assert(trace.includes('Metric Landmark Transform Trace'), 'transform trace should have title');
assert(trace.includes('Landmark Answers'), 'transform trace should answer landmark parity');
assert(trace.includes('Detailed First Frame Chains'), 'transform trace should include detailed chains');
assert(trace.includes('FPS hilt') || trace.includes('FPS Hilt'), 'transform trace should mention FPS hilt');
assert(trace.includes('MESHY') || trace.includes('Meshy'), 'transform trace should mention Meshy');

assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'audit must not change Meshy accepted startup baseline');
assert(!profiles.includes('pose-lab-metric-landmark-audit-v1'), 'audit schema must not be wired into production profiles');
assert(!profiles.includes('metric_landmark_audit'), 'audit must not edit production visibility or aliases');
assert(!bladeWorkspace.includes('metric_landmark_audit'), 'audit must not alter blade vector diagnostic behavior');
assert(!auditTool.includes('actor.info.weaponAttachment') && !auditTool.includes('startupClip:'), 'audit tool must not write runtime profile/startup fields');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: [
    'diagnostic-only',
    'all-onehandready-keys',
    'metric-vs-rendered-marker-parity',
    'transform-trace',
    'actual-mesh-overlay-points',
    'no-production-wiring',
  ],
  data: result.data,
  png: result.png,
  transformTrace: result.transformTrace,
  summary: data.summary,
}, null, 2));
