import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const evidencePath = path.join(projectRoot, 'generated', 'visual_red_build', 'meshy_ready_weapon_fk_follow_latest.json');
const observedPath = path.join(projectRoot, 'generated', 'visual_red_build', 'meshy_ready_weapon_fk_follow_observed_web_truth.json');
const runtimePath = path.join(projectRoot, 'src', 'pose-lab.js');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }
function readRuntimeBuild() {
  const runtime = fs.readFileSync(runtimePath, 'utf8');
  const match = runtime.match(/const\s+LAB_BUILD\s*=\s*['"]([^'"]+)['"]/);
  return match?.[1] || null;
}
function readCacheToken() {
  const runtime = fs.readFileSync(runtimePath, 'utf8');
  const match = runtime.match(/const\s+LAB_CACHE_TOKEN\s*=\s*['"]([^'"]+)['"]/);
  return match?.[1] || null;
}
assert(fs.existsSync(observedPath), `missing observed web truth: ${path.relative(projectRoot, observedPath)}`);
const observed = fs.existsSync(observedPath) ? JSON.parse(fs.readFileSync(observedPath, 'utf8')) : {};
assert(observed.schema === 'pose-lab-ready-weapon-fk-observed-web-truth-v1', 'observed web truth schema mismatch');
assert(observed.browserCaptureDeprecated === true, 'observed web truth must mark browser capture deprecated');
assert(observed.visualClass === 'sword-rest-space', 'current human web truth should remain red');
assert(observed.cacheToken === readCacheToken(), 'observed web truth cache token should match runtime');
assert(observed.runtimeBuild === readRuntimeBuild(), 'observed web truth runtime build should match runtime');
assert(Array.isArray(observed.capturePaths) && observed.capturePaths.length >= 1, 'observed web truth should preserve human evidence paths');
for (const key of ['tPoseWeaponPlacementAccepted', 'readyHandsCorrected', 'readySwordNotFollowingFinalFk', 'browserCaptureRejectedAsAcceptance', 'expectedReadySwordFollowsFinalFk']) {
  assert(observed.visualAssertions?.[key] === true, `observed web truth assertion should be true: ${key}`);
}
assert(!fs.readFileSync(path.join(projectRoot, 'tools', 'meshy_ready_weapon_offline_visual_truth.mjs'), 'utf8').includes("const observedWebTruth = {"), 'verifier must not hardcode observed web truth');

assert(fs.existsSync(evidencePath), `missing offline/web parity gate: ${path.relative(projectRoot, evidencePath)}`);
const evidence = fs.existsSync(evidencePath) ? JSON.parse(fs.readFileSync(evidencePath, 'utf8')) : {};
assert(evidence.schema === 'pose-lab-ready-weapon-fk-offline-web-parity-gate-v1', 'red build gate should use offline/web parity schema');
assert(evidence.browserCaptureDeprecated === true, 'browser/device capture must be deprecated as red-build proof');
assert(String(evidence.browserCapturePolicy || '').includes('cannot close this red build'), 'browser capture policy should reject red-build closure');
assert(evidence.currentFixCacheToken === readCacheToken(), 'evidence cache token should match runtime');
assert(evidence.cacheToken === readCacheToken(), 'evidence promotion cache token should match runtime');
assert(evidence.runtimeBuild === readRuntimeBuild(), 'evidence runtime build should match runtime');
assert(evidence.sharedTruthModule === 'src/ready-weapon-truth.mjs', 'gate should require shared runtime/offline truth module');
assert(evidence.observedWebTruthPath === path.relative(projectRoot, observedPath), 'gate should point to observed web truth artifact');
assert(evidence.observedWebTruth?.visualClass === 'sword-rest-space', 'current human web truth should remain red context');
assert(evidence.observedTruth?.authority === 'context-only', 'observed web truth should be context only');
assert(evidence.visibilityPolicy === 'candidate-lane-only', 'Ready verifier should make candidate visible only in proof lane');
assert(evidence.visibilityGate?.status === 'pass', 'offline visibility gate should pass inside the verifier candidate lane');
assert(evidence.visibilityGate?.visibilityClass === 'weapon-visible', 'offline visibility gate should model Ready candidate visibility in verifier lane');
assert(evidence.transformGate?.status === 'pass', 'transform gate should pass after boring FK is measured in candidate lane');
assert(evidence.transformGate?.transformClass === 'sword-follows-fk', 'offline transform measurements should pass independently of observed truth');
assert((evidence.promotionVerdict || evidence.parity)?.visualVerdict === 'fixed', 'current machine gate should be fixed when candidate visibility and transform pass');
const offline = evidence.offlineVisualTruth || {};
const artifactPath = path.join(projectRoot, offline.artifactPath || '');
const sheetPath = path.join(projectRoot, offline.sheetPath || '');
assert(fs.existsSync(artifactPath), `missing parity artifact ${offline.artifactPath}`);
assert(fs.existsSync(sheetPath), `missing parity sheet ${offline.sheetPath}`);
assert(fs.existsSync(sheetPath) && fs.statSync(sheetPath).size > 1000, 'parity sheet should be non-empty');
const artifact = fs.existsSync(artifactPath) ? JSON.parse(fs.readFileSync(artifactPath, 'utf8')) : {};
assert(artifact.schema === 'pose-lab-offline-web-truth-parity-ready-weapon-fk-v1', 'parity artifact schema mismatch');
assert(artifact.browserCaptureDeprecated === true, 'parity artifact should reject browser capture as proof');
assert(artifact.sharedTruthModule === 'src/ready-weapon-truth.mjs', 'parity artifact should name shared truth module');
assert(artifact.observedWebTruthPath === path.relative(projectRoot, observedPath), 'parity artifact should name observed web truth artifact');
assert(artifact.observedTruth?.authority === 'context-only', 'parity artifact should mark observed truth as context-only');
assert(artifact.visibilityGate?.status === 'pass', 'parity artifact should expose the passing candidate visibility gate');
assert(artifact.transformGate?.status === 'pass', 'parity artifact should expose the passing transform gate');
assert(offline.result === artifact.result, 'gate result should mirror parity artifact result');
assert((artifact.promotionVerdict || artifact.parity)?.visualVerdict === 'fixed', 'infrastructure check should accept machine truth while observed remains context-only');
if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-candidate-lane-visibility-contract', 'observed-web-truth-context-only', 'runtime-default-visibility-protected'], evidencePath: path.relative(projectRoot, evidencePath), observed: evidence.observedWebTruth?.visualClass, offline: evidence.offlineTruth?.visualClass, result: artifact.result }, null, 2));
