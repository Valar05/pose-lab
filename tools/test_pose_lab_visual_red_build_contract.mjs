import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

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

function currentCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
}

const protocol = fs.readFileSync(path.join(projectRoot, 'docs', 'POSE_LAB_EVIDENCE_PROTOCOL.md'), 'utf8');
const firebaseDoc = fs.readFileSync(path.join(projectRoot, 'docs', 'FIREBASE_VISUAL_TRUTH.md'), 'utf8');
const humanRedBuilds = fs.readFileSync(path.join(projectRoot, 'evidence', 'human_visual_truth_red_builds.json'), 'utf8');
const captureScript = fs.readFileSync(path.join(projectRoot, 'tools', 'capture_firebase_visual_truth.mjs'), 'utf8');
const preflightScript = fs.readFileSync(path.join(projectRoot, 'tools', 'pose_lab_visual_truth_preflight.mjs'), 'utf8');
const appSource = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');

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
assert(captureScript.includes('Ready blade axis points down through the body'), 'Firebase capture must fail Ready blade-axis visual regressions');
assert(captureScript.includes('Ready hand did not visibly move') && captureScript.includes('Ready clip-scoped hilt target is not visible'), 'Firebase capture must fail missing visible motion and clip-scoped hilt target proof');
assert(captureScript.includes('Ready basket/front orientation is not visually sane') && captureScript.includes('Ready socket-forward to blade axis is not visually sane'), 'Firebase capture must fail weapon orientation sanity regressions');
assert(!captureScript.includes('staticDirectFkProof === true ||'), 'Firebase capture must not let static direct FK bypass visible motion proof');
assert(captureScript.includes('weapon rotation-probe'), 'Firebase capture must preserve cloud rotation-probe evidence when Ready blade-axis proof is red');
assert(captureScript.includes('function relationshipChecksFromTelemetry'), 'Firebase capture must evaluate explicit relationship verdicts');
assert(captureScript.includes('synthesizeCaptureSense') && captureScript.includes('synthesizeEvidenceSense'), 'Firebase capture must write Sense Synthesis verdicts');
assert(captureScript.includes('reviewTruthFailures') && captureScript.includes('visibleUiTruthAccepted'), 'Firebase capture must fail when the hosted visible UI truth is red');
assert(captureScript.includes('MOBILE_REVIEW_VIEWPORT') && captureScript.includes('isMobile: true'), 'Firebase capture must reproduce the mobile review surface');
assert(captureScript.includes('gotoHostedMeshyPage(page, captureUrl, capture.clip)') && captureScript.includes('routeRetry='), 'Firebase capture must cold-load the exact review URL with retry instead of only switching clips through debug state');
assert(captureScript.includes('relationshipCloseupClip(page)') && !captureScript.includes('x: 360, y: 230'), 'Firebase capture must not crop relationship proof with desktop-only coordinates');
assert(captureScript.includes('loadWarning: loadMs > LANDING_LOAD_WARN_MS'), 'Firebase capture must preserve slow hosted review load as diagnostic warning only');
assert(!captureScript.includes('landing hosted review load exceeded'), 'Firebase capture must not fail visual truth solely because hosted review is slow');
assert(captureScript.includes('tposeWristRelationshipAccepted: relationship.tposeWristRelationshipAccepted'), 'Firebase capture must not hard-code T-pose relationship failure');
assert(captureScript.includes('readyVisualRelationshipAccepted: relationship.readyVisualRelationshipAccepted'), 'Firebase capture must not hard-code Ready relationship failure');
assert(captureScript.includes('relationshipCloseup'), 'Firebase capture must preserve relationship close-up screenshots');
assert(appSource.includes('proxy.activeAttachmentConfig = effectiveConfig'), 'Pose Lab must persist active clip-scoped weapon attachment config');
assert(appSource.includes('proxy.activeAttachmentConfig || proxy.attachmentConfig || actor.info?.weaponAttachment'), 'Pose Lab weapon diagnostics must read the active clip-scoped attachment config');
assert(protocol.includes('visible relationship') && firebaseDoc.includes('visible relationship'), 'Pose Lab docs must name visible relationship truth');
assert(protocol.includes('Sense Synthesis') && firebaseDoc.includes('Sense Synthesis'), 'Pose Lab docs must require Sense Synthesis for visual acceptance');
assert(protocol.includes('phone-visible hosted URL is part of cloud truth'), 'evidence protocol must treat Android Chrome hosted review as cloud truth');
assert(firebaseDoc.includes('Phone-wake false-green checkpoint') && firebaseDoc.includes('28649227859'), 'Firebase doc must preserve the phone-wake false-green checkpoint');
assert(humanRedBuilds.includes('a92fa0bb6dc5b83644688db2d8b04d7c9b2f56b5'), 'human red-build ledger must preserve the phone-visible red review for commit a92fa0b');
assert(humanRedBuilds.includes('REVIEW ROUTE READY') && humanRedBuilds.includes('T-pose/rest'), 'human red-build ledger must name route-ready and rest-hydration failures');
assert(humanRedBuilds.includes('e6cc6635631c1f1a983932d01e3233f25640e933') && humanRedBuilds.includes('28678973256'), 'human red-build ledger must preserve the latest false-green strike');
assert(preflightScript.includes('AUTHORITY_REVOKED_FALSE_GREEN') && preflightScript.includes('allowedNextAction'), 'preflight must revoke authority and provide the only allowed next action for false-green vetoes');
assert(appSource.includes('reviewTruthState') && appSource.includes('REVIEW RED'), 'Pose Lab runtime must expose visible review truth in the UI');
assert(appSource.includes('Meshy review UI fell back to walking-only clip inventory'), 'Pose Lab runtime must mark walking-only Meshy review inventory red');

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
if (evidence.cacheToken !== currentCacheToken()) {
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({
    checked: ['pose-lab-cloud-visual-red-build-contract'],
    status: 'pending',
    reason: `stale Firebase hosted visual truth evidence: ${evidence.cacheToken || 'missing'} does not match served token ${currentCacheToken()}`,
    evidencePath: path.relative(projectRoot, evidencePath),
  }, null, 2));
  process.exit(0);
}
if (evidence.commit !== currentCommit() && evidence.headCommit !== currentCommit()) {
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({
    checked: ['pose-lab-cloud-visual-red-build-contract'],
    status: 'pending',
    reason: `stale Firebase hosted visual truth evidence: commit ${evidence.commit || 'missing'} head ${evidence.headCommit || 'missing'} does not match current ${currentCommit()}`,
    evidencePath: path.relative(projectRoot, evidencePath),
  }, null, 2));
  process.exit(0);
}
assert(evidence.senseSynthesis?.schema === 'pose-lab-sense-synthesis-v1', 'visual red-build evidence must include Sense Synthesis verdict');
if (evidence.humanRedBuild) {
  assert(evidence.ok === false, 'human visual contradiction must keep Firebase visual truth red');
  assert(evidence.truthLedger?.human === false, 'human visual contradiction must mark human truth red');
} else {
  assert(evidence.ok === true, 'Firebase visual truth must be green before closing a visual red build');
  assert(evidence.truthLedger?.tposeStableIdle === true, 'Firebase visual truth must prove stable T-pose/idle saber placement');
  assert(evidence.truthLedger?.readyBoringFk === true, 'Firebase visual truth must prove Ready boring FK');
  assert(evidence.truthLedger?.senseSynthesis === true, 'Firebase visual truth must prove Sense Synthesis green');
}
const tpose = evidence.captures?.find((capture) => capture.id === 'tpose');
const ready = evidence.captures?.find((capture) => capture.id === 'ready');
assert(tpose?.evaluation?.checks?.acceptedHiltOracle === true, 'T-pose cloud capture must preserve accepted hilt oracle');
assert(Object.hasOwn(tpose?.evaluation?.checks || {}, 'tposeWristRelationshipAccepted'), 'T-pose cloud capture must record wrist/saber visible relationship acceptance');
assert(Object.hasOwn(tpose?.evaluation?.checks || {}, 'defaultSurfaceAccepted'), 'T-pose cloud capture must record default-surface visible acceptance');
assert(Object.hasOwn(ready?.evaluation?.checks || {}, 'readyVisualRelationshipAccepted'), 'Ready cloud capture must record hand/hilt/blade visible relationship acceptance');
assert(tpose?.senseSynthesis?.checks?.heldByHandRead === true, 'T-pose Sense Synthesis must say the weapon reads as hand-owned');
assert(ready?.senseSynthesis?.checks?.heldByHandRead === true, 'Ready Sense Synthesis must say the weapon reads as hand-owned');
assert(Object.hasOwn(ready?.cloudTelemetry?.visualFollow?.screenMetrics || {}, 'maxTipDropFromAppliedHiltPx'), 'Ready cloud capture must record blade tip drop from hilt');
assert(evidence.captures?.find((capture) => capture.id === 'landing')?.evaluation?.checks?.visibleUiTruthAccepted === true, 'Landing cloud capture must prove visible UI truth accepted');
assert(tpose?.evaluation?.checks?.visibleUiTruthAccepted === true, 'T-pose cloud capture must prove visible UI truth accepted');
assert(ready?.evaluation?.checks?.visibleUiTruthAccepted === true, 'Ready cloud capture must prove visible UI truth accepted');
if (!evidence.humanRedBuild) {
  assert(tpose?.accepted === true && tpose?.evaluation?.checks?.tposeWristRelationshipAccepted === true, 'T-pose cloud capture must prove accepted wrist/saber relationship');
  assert(tpose?.evaluation?.checks?.defaultSurfaceAccepted === true, 'default cloud surface must prove accepted visible state');
  assert(ready?.accepted === true && ready?.evaluation?.checks?.tipTracksHand === true, 'Ready cloud capture must prove saber tip tracks hand');
  assert(ready?.accepted === true && ready?.evaluation?.checks?.hiltAwayFromRawHand === true, 'Ready cloud capture must prove hilt is visibly away from the raw hand/wrist');
  assert(ready?.accepted === true && ready?.evaluation?.checks?.readyHandOrientationSane === true, 'Ready cloud capture must prove hand orientation/grip basis is visually sane');
  assert(ready?.evaluation?.checks?.readyBladeNotPointingDownThroughBody === true, 'Ready cloud capture must prove blade axis does not point down through the body');
  assert(ready?.evaluation?.checks?.readyVisualRelationshipAccepted === true, 'Ready cloud capture must prove accepted hand/hilt/blade visual relationship');
}
const preflightResult = spawnSync('node', ['tools/pose_lab_visual_truth_preflight.mjs', '--json'], {
  cwd: projectRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
const preflight = JSON.parse(preflightResult.stdout || '{}');
if (preflight.status === 'AUTHORITY_REVOKED_FALSE_GREEN') {
  assert(preflight.ok === false, 'authority-revoked preflight must be red');
  assert(preflight.failures.some((failure) => failure.includes('AUTHORITY_REVOKED_FALSE_GREEN')), 'preflight must preserve false-green failure text');
} else if (!evidence.humanRedBuild) {
  assert(preflight.ok === true, 'non-vetoed Firebase evidence must pass visual truth preflight before red-build contract can pass');
}
assert(typeof tpose?.screenshot === 'string' && tpose.screenshot.endsWith('.png'), 'T-pose cloud capture must include screenshot');
assert(typeof tpose?.relationshipCloseup === 'string' && tpose.relationshipCloseup.endsWith('.png'), 'T-pose cloud capture must include relationship close-up screenshot');
assert(typeof ready?.relationshipCloseup === 'string' && ready.relationshipCloseup.endsWith('.png'), 'Ready cloud capture must include relationship close-up screenshot');
assert(typeof ready?.contactSheet === 'string' && ready.contactSheet.endsWith('.png'), 'Ready cloud capture must include visual-follow contact sheet');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-cloud-visual-red-build-contract'], evidencePath: path.relative(projectRoot, evidencePath), cacheToken: currentCacheToken() }, null, 2));
