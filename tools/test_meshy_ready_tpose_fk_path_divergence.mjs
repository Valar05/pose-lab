import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const out = path.join(projectRoot, 'generated', 'test_runs', `meshy-fk-path-divergence-${process.pid}`);
const tool = path.join(projectRoot, 'tools', 'meshy_fk_path_divergence.mjs');
const source = fs.readFileSync(tool, 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(source.includes('diagnosticOnly: true') && source.includes('productionBehaviorModified: false'), 'divergence tool must be diagnostic-only');
assert(source.includes('READY_CLIP') && source.includes('TPOSE_CLIP'), 'divergence tool must compare Ready and T-pose');
assert(source.includes('animatedSourceSocketRotation') && source.includes('animatedSocketRotation'), 'divergence tool must report weapon animation-track branch flags');
assert(source.includes('placementSignature'), 'divergence tool must report the placement signature consumed by runtime rules');
assert(source.includes('parentLocalMatrix') && source.includes('maxParentLocalMatrixDrift'), 'divergence tool must compare local matrix drift, not just landmarks');
assert(source.includes('track-summary-differs') && source.includes('runtime-field-differs'), 'divergence tool must classify path differences');
assert(source.includes('handLocalLandmarks') && source.includes('right-hand-local-landmark-differs'), 'divergence tool must compare weapon landmarks in RightHand local space');
assert(source.includes('acceptedAsFix: false'), 'divergence artifact must not present itself as a fix');

const raw = execFileSync('node', [tool, '--out', out, '--samples', '3'], { cwd: projectRoot, encoding: 'utf8' });
const summary = JSON.parse(raw.slice(raw.indexOf('{')));
const report = JSON.parse(fs.readFileSync(path.join(projectRoot, summary.path), 'utf8'));

assert(report.schema === 'pose-lab-meshy-fk-path-divergence-v1', `unexpected schema ${report.schema}`);
assert(report.diagnosticOnly === true && report.productionBehaviorModified === false, 'report must be diagnostic-only');
assert(report.acceptedAsFix === false, 'report must not claim a fix');
assert(report.clips?.ready?.generatedClipResolved === true, 'Ready generated clip should resolve for comparison');
assert(report.clips?.tpose?.generatedClipResolved === true, 'T-pose generated clip should resolve for comparison');
for (const clip of [report.clips.ready, report.clips.tpose]) {
  assert(Array.isArray(clip.trackSummary?.WeaponR), `${clip.clip} missing WeaponR track summary`);
  assert(Array.isArray(clip.trackSummary?.WeaponGrip), `${clip.clip} missing WeaponGrip track summary`);
  assert(clip.samples?.every((sample) => sample.matrices?.RightHand && sample.matrices?.WeaponR && sample.matrices?.WeaponGrip && sample.matrices?.displayRoot && sample.matrices?.weaponMesh), `${clip.clip} missing sampled FK matrices`);
  assert(clip.samples?.every((sample) => sample.handLocalLandmarks?.weaponGrip && sample.handLocalLandmarks?.appliedHilt && sample.handLocalLandmarks?.visibleMeshHilt), `${clip.clip} missing RightHand-local landmark samples`);
  assert(clip.samples?.every((sample) => typeof sample.animatedSourceSocketRotation === 'boolean' && typeof sample.animatedSocketRotation === 'boolean'), `${clip.clip} missing runtime branch flags`);
}
assert(report.ok === false, 'current broken state should remain classified as divergent until the FK contract is actually shared');
assert(report.comparison?.blockers?.length > 0, 'divergent report should name blockers');
assert(report.comparison.blockers.some((item) => item.startsWith('track-summary-differs:') || item.startsWith('runtime-field-differs:') || item.startsWith('right-hand-local-landmark-differs:')), `expected track/runtime/hand-local divergence blocker, got ${JSON.stringify(report.comparison.blockers)}`);
assert(report.comparison?.crossClipHandLocalDelta?.appliedHilt > 0.001, 'report should measure the applied hilt mismatch in RightHand local space');

const asserted = spawnSync('node', [tool, '--out', path.join(out, 'assert-shared'), '--samples', '3', '--assert-shared'], { cwd: projectRoot, encoding: 'utf8' });
assert(asserted.status !== 0, '--assert-shared should fail while Ready and T-pose consume divergent FK paths');
assert(String(asserted.stderr || asserted.stdout).includes('do not consume the same FK path'), '--assert-shared failure should explain the path divergence');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['meshy-ready-tpose-fk-path-divergence', 'matrix-level-fk-path-report', 'assert-shared-negative-control'],
  report: summary.path,
  blockers: report.comparison.blockers,
}, null, 2));
