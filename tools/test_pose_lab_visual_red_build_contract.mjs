import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const evidencePath = path.join(projectRoot, 'generated', 'visual_red_build', 'meshy_ready_weapon_fk_follow_latest.json');
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
assert(fs.existsSync(evidencePath), `missing offline/web parity gate: ${path.relative(projectRoot, evidencePath)}`);
const evidence = fs.existsSync(evidencePath) ? JSON.parse(fs.readFileSync(evidencePath, 'utf8')) : {};
assert(evidence.schema === 'pose-lab-ready-weapon-fk-offline-web-parity-gate-v1', 'red build gate should use offline/web parity schema');
assert(evidence.browserCaptureDeprecated === true, 'browser/device capture must be deprecated as red-build proof');
assert(String(evidence.browserCapturePolicy || '').includes('cannot close this red build'), 'browser capture policy should reject red-build closure');
assert(evidence.currentFixCacheToken === readCacheToken(), 'evidence cache token should match runtime');
assert(evidence.runtimeBuild === readRuntimeBuild(), 'evidence runtime build should match runtime');
assert(evidence.sharedTruthModule === 'src/ready-weapon-truth.mjs', 'gate should require shared runtime/offline truth module');
assert(evidence.observedWebTruth?.visualClass === 'sword-rest-space', 'current human web truth should remain red');
assert(evidence.parity?.visualVerdict === 'red', 'current parity gate should be red until visual truth changes');
assert(evidence.parity?.parityFailure === 'offline-web-visual-class-diverged' || evidence.offlineTruth?.visualClass === 'sword-rest-space', 'red gate should explain divergence or same-class visual red');
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
assert(offline.result === artifact.result, 'gate result should mirror parity artifact result');
assert(artifact.parity?.visualVerdict === 'red', 'infrastructure check should preserve the current red build');
if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-offline-web-parity-red-build-contract'], evidencePath: path.relative(projectRoot, evidencePath), observed: evidence.observedWebTruth?.visualClass, offline: evidence.offlineTruth?.visualClass, result: artifact.result }, null, 2));
