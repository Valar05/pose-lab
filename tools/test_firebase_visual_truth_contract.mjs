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
assert(evidence.authority === 'firebase-hosted-cloud-browser', 'Firebase visual truth should be the cloud-hosted browser authority');
assert(evidence.controller?.role === 'controller-only', 'Firebase visual truth should label Playwright as controller-only');
assert(evidence.controller?.acceptanceRule?.includes('hosted Firebase HTTPS URL'), 'Firebase visual truth should require a hosted Firebase HTTPS URL');
assert(evidence.deprecatedAcceptance?.offlineRender === 'diagnostic-only', 'offline render must be diagnostic-only, not acceptance authority');
assert(evidence.deprecatedAcceptance?.localPlaywrightAgainstLocalhost === 'not accepted', 'local Playwright against localhost must not be accepted');
assert(evidence.deprecatedAcceptance?.generatedFirebaseStaging === 'not accepted', 'generated Firebase staging must not be accepted');
assert(Array.isArray(evidence.captures) && evidence.captures.length >= 3, 'Firebase visual truth should include landing, T-pose, and Ready captures');
assert(evidence.captures.some((capture) => capture.id === 'landing'), 'Firebase visual truth should include human-review landing capture');
assert(evidence.captures.some((capture) => capture.id === 'tpose'), 'Firebase visual truth should include T-pose stable idle capture');
assert(evidence.captures.some((capture) => capture.id === 'ready'), 'Firebase visual truth should include Ready FK capture');

for (const capture of evidence.captures || []) {
  if (capture.id === 'human-red-build') {
    assert(capture.actor === 'human-review', 'human red-build capture should be explicitly marked human-review');
    assert(capture.accepted === false, 'human red-build capture must stay red');
    assert(capture.evaluation?.ok === false, 'human red-build capture evaluation must stay red');
    assert(Array.isArray(capture.evaluation?.failures) && capture.evaluation.failures.length > 0, 'human red-build capture must preserve the human failure reasons');
    continue;
  }
  assert(capture.actor === 'meshyCharacter', 'Firebase capture actor should be meshyCharacter');
  if (capture.id !== 'landing') assert(typeof capture.clip === 'string' && capture.clip.includes('meshyCharacter'), 'Firebase capture clip should name the Meshy route');
  assert(typeof capture.screenshot === 'string' && capture.screenshot.endsWith('.png'), 'Firebase capture should name a PNG screenshot');
  if (capture.id === 'tpose' || capture.id === 'ready') {
    assert(typeof capture.relationshipCloseup === 'string' && capture.relationshipCloseup.endsWith('.png'), `Firebase capture should name a relationship close-up PNG: ${capture.id}`);
  }
  assert(typeof capture.url === 'string' && capture.url.startsWith('https://'), 'Firebase capture should preserve the hosted HTTPS URL');
  assert(capture.url.startsWith('https://pose-lab-visual-truth'), 'Firebase capture must load the pose-lab-visual-truth cloud URL');
  assert(capture.routeSelected === true, `Firebase capture should route-select Meshy Character: ${capture.id}`);
  assert(typeof capture.visibleRead === 'string' && capture.visibleRead.length >= 10, 'Firebase capture should include a human-readable visibleRead');
  assert(capture.cloudTelemetry?.weapon?.ok === true, `Firebase capture should include successful cloud weapon telemetry: ${capture.id}`);
  assert(capture.cloudTelemetry?.liveHilt?.ok === true, `Firebase capture should include successful cloud live hilt telemetry: ${capture.id}`);
  if (evidence.humanRedBuild) {
    assert(capture.accepted === false, `human-red evidence must keep normal captures red: ${capture.id}`);
    assert(capture.evaluation?.ok === false, `human-red evidence must keep normal capture evaluations red: ${capture.id}`);
    assert(Array.isArray(capture.evaluation?.failures) && capture.evaluation.failures.length > 0, `human-red capture should preserve visible relationship failures: ${capture.id}`);
  } else {
    assert(capture.accepted === true, `Firebase capture should be accepted by cloud telemetry: ${capture.id} ${JSON.stringify(capture.evaluation?.failures || [])}`);
    assert(capture.evaluation?.ok === true, `Firebase capture should include passing evaluation: ${capture.id}`);
  }
}
const landing = evidence.captures.find((capture) => capture.id === 'landing');
assert(landing?.evaluation?.checks?.reviewClipInventoryVisible === true, 'Landing cloud evidence must prove review clip inventory is visible');
assert(landing?.evaluation?.checks?.loadFastEnough === true, 'Landing cloud evidence must prove review page load is usable');
const tpose = evidence.captures.find((capture) => capture.id === 'tpose');
assert(tpose?.evaluation?.checks?.acceptedHiltOracle === true, 'T-pose cloud evidence must preserve the accepted hilt oracle');
assert(tpose?.evaluation?.checks?.acceptedAttachmentRotation === true, 'T-pose cloud evidence must preserve the accepted attachment rotation');
assert(tpose?.evaluation?.checks?.realWeaponVisible === true, 'T-pose cloud evidence must prove real weapon visibility');
assert(tpose?.evaluation?.checks?.hiltPinnedToSocket === true, 'T-pose cloud evidence must prove hilt pinning');
assert(Object.hasOwn(tpose?.evaluation?.checks || {}, 'tposeWristRelationshipAccepted'), 'T-pose cloud evidence must record wrist/saber visible relationship acceptance');
assert(Object.hasOwn(tpose?.evaluation?.checks || {}, 'defaultSurfaceAccepted'), 'T-pose cloud evidence must record default visible surface acceptance');
assert(typeof tpose?.relationshipCloseup === 'string' && tpose.relationshipCloseup.endsWith('tpose_relationship_closeup.png'), 'T-pose cloud evidence must include wrist/saber close-up');
const ready = evidence.captures.find((capture) => capture.id === 'ready');
assert(typeof ready?.relationshipCloseup === 'string' && ready.relationshipCloseup.endsWith('ready_relationship_closeup.png'), 'Ready cloud evidence must include hand/hilt/blade close-up');
assert(typeof ready?.contactSheet === 'string' && ready.contactSheet.endsWith('.png'), 'Ready cloud evidence should include a visual-follow contact sheet PNG');
assert(ready?.cloudTelemetry?.visualFollow?.ok === true, 'Ready cloud evidence must include successful visual-follow telemetry');
assert(ready?.evaluation?.checks?.realWeaponVisible === true, 'Ready cloud evidence must prove real weapon visibility');
assert(ready?.evaluation?.checks?.parentChain === true, 'Ready cloud evidence must prove FK parent chain');
assert(ready?.evaluation?.checks?.hiltPinnedToSocket === true || ready?.evaluation?.checks?.clipScopedHiltTargetVisible === true, 'Ready cloud evidence must prove hilt pinning or a visible clip-scoped hilt target');
assert(ready?.evaluation?.checks?.handLocalGripOffsetVisible === true, 'Ready cloud evidence must prove hand-local grip offset is visibly separated from the raw wrist');
assert(ready?.evaluation?.checks?.hiltAwayFromRawHand === true, 'Ready cloud evidence must prove the hilt has not collapsed onto the raw hand/wrist');
assert(ready?.evaluation?.checks?.readyHandOrientationSane === true, 'Ready cloud evidence must prove the hand orientation/grip basis is visually sane');
assert(ready?.evaluation?.checks?.reviewClipInventoryVisible === true, 'Ready cloud evidence must prove review clip inventory is visible');
assert(ready?.evaluation?.checks?.bodyPoseLandmarksPresent === true, 'Ready cloud evidence must expose body pose landmarks for hand-orientation review');
assert(ready?.evaluation?.checks?.staticDirectFkProof === true || (ready?.evaluation?.checks?.handMoves === true && ready?.evaluation?.checks?.tipMoves === true && ready?.evaluation?.checks?.tipTracksHand === true), 'Ready cloud evidence must prove static direct FK or hand/saber tip motion together');
assert(Object.hasOwn(ready?.evaluation?.checks || {}, 'readyVisualRelationshipAccepted'), 'Ready cloud evidence must record hand/hilt/blade visible relationship acceptance');
assert(evidence.truthLedger?.landingUsable === true, 'truth ledger must mark landing page usable green');
assert(evidence.truthLedger?.cloudUrlLoaded === true, 'truth ledger must mark cloud URL loading green');
if (!evidence.humanRedBuild) {
  assert(evidence.truthLedger?.tposeStableIdle === true, 'truth ledger must mark T-pose stable idle green');
  assert(evidence.truthLedger?.readyBoringFk === true, 'truth ledger must mark Ready boring FK green');
}
if (evidence.humanRedBuild) {
  assert(evidence.ok === false, 'human red-build veto must keep Firebase visual truth red');
  assert(evidence.truthLedger?.human === false, 'truth ledger must mark human truth red when a human red-build veto exists');
  assert(evidence.captures.some((capture) => capture.id === 'human-red-build'), 'human red-build veto must be preserved as a capture record');
} else {
  assert(tpose?.evaluation?.checks?.tposeWristRelationshipAccepted === true, 'green Firebase evidence must prove accepted T-pose wrist/saber relationship');
  assert(tpose?.evaluation?.checks?.defaultSurfaceAccepted === true, 'green Firebase evidence must prove accepted default visible surface');
  assert(ready?.evaluation?.checks?.readyVisualRelationshipAccepted === true, 'green Firebase evidence must prove accepted Ready hand/hilt/blade relationship');
  assert(evidence.ok === true, 'Firebase visual truth evidence must be green only when landing, T-pose, and Ready pass');
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['firebase-visual-truth-contract'], evidencePath: path.relative(projectRoot, evidencePath), cacheToken: currentCacheToken() }, null, 2));
