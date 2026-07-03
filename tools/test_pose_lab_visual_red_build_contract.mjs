import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const evidencePath = path.join(projectRoot, 'generated', 'firebase_visual_truth', 'latest', 'visual_truth.json');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function currentCacheToken() {
  const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
  return html.match(/pose-lab\.js\?v=([^'"\s]+)/)?.[1] || '';
}

const protocol = fs.readFileSync(path.join(projectRoot, 'docs', 'POSE_LAB_EVIDENCE_PROTOCOL.md'), 'utf8');
const firebaseDoc = fs.readFileSync(path.join(projectRoot, 'docs', 'FIREBASE_VISUAL_TRUTH.md'), 'utf8');
const captureScript = fs.readFileSync(path.join(projectRoot, 'tools', 'capture_firebase_visual_truth.mjs'), 'utf8');

assert(protocol.includes('Firebase hosted visual truth is tier-one'), 'evidence protocol must make Firebase hosted visual truth tier-one');
assert(protocol.includes('wake the exact Ready capture URL'), 'evidence protocol must require waking the exact Ready capture URL before handoff');
assert(!protocol.includes('wake the exact `hostedUrl`'), 'evidence protocol must not tell agents to wake the base hostedUrl');
assert(protocol.includes('offline render') && protocol.includes('diagnostic-only'), 'evidence protocol must demote offline render to diagnostic-only');
assert(firebaseDoc.includes('T-pose stable idle') && firebaseDoc.includes('Ready boring FK'), 'Firebase doc must name both required Meshy saber truths');
assert(firebaseDoc.includes('wake the exact Ready capture URL'), 'Firebase doc must require waking the exact Ready capture URL used by the artifact');
assert(!firebaseDoc.includes('wake the exact `hostedUrl`'), 'Firebase doc must not tell agents to wake the base hostedUrl');
assert(captureScript.includes('evaluateTpose') && captureScript.includes('evaluateReady'), 'Firebase capture must evaluate both T-pose and Ready');
assert(captureScript.includes("authority: 'firebase-hosted-cloud-browser'"), 'Firebase capture must declare cloud authority');
assert(captureScript.includes("offlineRender: 'diagnostic-only'"), 'Firebase capture must reject offline render as acceptance');
assert(!captureScript.includes("captureKind: 'offline-pose-render'"), 'Firebase capture must not emit offline-pose-render evidence');
assert(captureScript.includes('Ready hilt collapsed onto raw hand/wrist'), 'Firebase capture must fail the red screenshot class where the hilt collapses onto the wrist');
assert(captureScript.includes('Ready hand orientation/grip evidence is not visually sane'), 'Firebase capture must fail Ready hand-orientation visual regressions');
assert(captureScript.includes('tposeWristRelationshipAccepted: false'), 'Firebase capture must not greenlight T-pose without explicit wrist/saber relationship acceptance');
assert(captureScript.includes('readyVisualRelationshipAccepted: false'), 'Firebase capture must not greenlight Ready without explicit hand/hilt/blade relationship acceptance');
assert(captureScript.includes('defaultSurfaceAccepted: false'), 'Firebase capture must not greenlight a default surface from route/clip selection alone');
assert(protocol.includes('visible relationship') && firebaseDoc.includes('visible relationship'), 'Pose Lab docs must name visible relationship truth');

if (!fs.existsSync(evidencePath)) {
  console.log(JSON.stringify({
    checked: ['pose-lab-cloud-visual-red-build-contract'],
    status: 'pending',
    reason: 'missing Firebase hosted visual truth evidence; run firebase-visual-truth workflow after committing',
    evidencePath: path.relative(projectRoot, evidencePath),
  }, null, 2));
  process.exit(0);
}

const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
assert(evidence.schema === 'pose-lab-firebase-visual-truth-v1', 'visual red-build evidence must use Firebase visual truth schema');
assert(evidence.authority === 'firebase-hosted-cloud-browser', 'visual red-build evidence authority must be Firebase hosted cloud browser');
assert(evidence.cacheToken === currentCacheToken(), `Firebase visual truth cache token must match served token ${currentCacheToken()}`);
if (evidence.humanRedBuild) {
  assert(evidence.ok === false, 'human visual contradiction must keep Firebase visual truth red');
  assert(evidence.truthLedger?.human === false, 'human visual contradiction must mark human truth red');
} else {
  assert(evidence.ok === true, 'Firebase visual truth must be green before closing a visual red build');
  assert(evidence.truthLedger?.tposeStableIdle === true, 'Firebase visual truth must prove stable T-pose/idle saber placement');
  assert(evidence.truthLedger?.readyBoringFk === true, 'Firebase visual truth must prove Ready boring FK');
}
const tpose = evidence.captures?.find((capture) => capture.id === 'tpose');
const ready = evidence.captures?.find((capture) => capture.id === 'ready');
assert(tpose?.evaluation?.checks?.acceptedHiltOracle === true, 'T-pose cloud capture must preserve accepted hilt oracle');
assert(Object.hasOwn(tpose?.evaluation?.checks || {}, 'tposeWristRelationshipAccepted'), 'T-pose cloud capture must record wrist/saber visible relationship acceptance');
assert(Object.hasOwn(tpose?.evaluation?.checks || {}, 'defaultSurfaceAccepted'), 'T-pose cloud capture must record default-surface visible acceptance');
assert(Object.hasOwn(ready?.evaluation?.checks || {}, 'readyVisualRelationshipAccepted'), 'Ready cloud capture must record hand/hilt/blade visible relationship acceptance');
if (!evidence.humanRedBuild) {
  assert(tpose?.accepted === true && tpose?.evaluation?.checks?.tposeWristRelationshipAccepted === true, 'T-pose cloud capture must prove accepted wrist/saber relationship');
  assert(tpose?.evaluation?.checks?.defaultSurfaceAccepted === true, 'default cloud surface must prove accepted visible state');
  assert(ready?.accepted === true && ready?.evaluation?.checks?.tipTracksHand === true, 'Ready cloud capture must prove saber tip tracks hand');
  assert(ready?.accepted === true && ready?.evaluation?.checks?.hiltAwayFromRawHand === true, 'Ready cloud capture must prove hilt is visibly away from the raw hand/wrist');
  assert(ready?.accepted === true && ready?.evaluation?.checks?.readyHandOrientationSane === true, 'Ready cloud capture must prove hand orientation/grip basis is visually sane');
  assert(ready?.evaluation?.checks?.readyVisualRelationshipAccepted === true, 'Ready cloud capture must prove accepted hand/hilt/blade visual relationship');
}
assert(typeof tpose?.screenshot === 'string' && tpose.screenshot.endsWith('.png'), 'T-pose cloud capture must include screenshot');
assert(typeof ready?.contactSheet === 'string' && ready.contactSheet.endsWith('.png'), 'Ready cloud capture must include visual-follow contact sheet');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-cloud-visual-red-build-contract'], evidencePath: path.relative(projectRoot, evidencePath), cacheToken: currentCacheToken() }, null, 2));
