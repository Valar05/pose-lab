import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const evidencePath = path.join(projectRoot, 'generated', 'firebase_visual_truth', 'latest', 'visual_truth.json');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

function currentCacheToken() {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
  return source.match(/const\s+LAB_CACHE_TOKEN\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

function currentRuntimeBuild() {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
  return source.match(/const\s+LAB_BUILD\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

if (!fs.existsSync(evidencePath)) {
  console.log(JSON.stringify({
    checked: ['firebase-visual-truth-contract'],
    status: 'pending',
    reason: 'missing hosted Firebase visual truth evidence; run the GitHub Action or Cloud runner after Firebase deploy',
    evidencePath: path.relative(projectRoot, evidencePath),
  }, null, 2));
  process.exit(0);
}

let evidence;
try {
  evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
} catch (error) {
  throw new Error(`invalid Firebase visual truth JSON: ${error.message}`);
}

assert(evidence.schema === 'pose-lab-firebase-visual-truth-v1', 'Firebase visual truth evidence should use schema pose-lab-firebase-visual-truth-v1');
assert(evidence.projectId === 'home-center-dclar', 'Firebase visual truth should come from home-center-dclar');
assert(evidence.hostingSite === 'pose-lab-visual-truth', 'Firebase visual truth should come from pose-lab-visual-truth');
assert(/^https:\/\/.+/.test(String(evidence.hostedUrl || '')), 'Firebase visual truth should include a hosted HTTPS URL');
assert(evidence.cacheToken === currentCacheToken(), `Firebase visual truth cacheToken must match current ${currentCacheToken()}`);
assert(evidence.runtimeBuild === currentRuntimeBuild(), `Firebase visual truth runtimeBuild must match current ${currentRuntimeBuild()}`);
assert(Array.isArray(evidence.captures) && evidence.captures.length >= 2, 'Firebase visual truth should include at least T-pose and Ready captures');

for (const capture of evidence.captures || []) {
  assert(capture.actor === 'meshyCharacter', 'Firebase capture actor should be meshyCharacter');
  assert(typeof capture.clip === 'string' && capture.clip.includes('meshyCharacter'), 'Firebase capture clip should name the Meshy route');
  assert(typeof capture.screenshot === 'string' && capture.screenshot.endsWith('.png'), 'Firebase capture should name a PNG screenshot');
  assert(typeof capture.visibleRead === 'string' && capture.visibleRead.length >= 10, 'Firebase capture should include a human-readable visibleRead');
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['firebase-visual-truth-contract'], evidencePath: path.relative(projectRoot, evidencePath), cacheToken: currentCacheToken() }, null, 2));
