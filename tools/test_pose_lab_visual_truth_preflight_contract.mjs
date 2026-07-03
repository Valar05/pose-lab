import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { synthesizeCaptureSense, synthesizeEvidenceSense } from './pose_lab_sense_synthesis.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const toolPath = path.join(projectRoot, 'tools', 'pose_lab_visual_truth_preflight.mjs');
const selfService = fs.readFileSync(path.join(projectRoot, 'tools', 'pose_lab_cloud_visual_truth_self_service.mjs'), 'utf8');
const wakeScript = fs.readFileSync(path.join(projectRoot, 'tools', 'wake_pose_lab_ready_cloud_url.mjs'), 'utf8');
const captureScript = fs.readFileSync(path.join(projectRoot, 'tools', 'capture_firebase_visual_truth.mjs'), 'utf8');
const failureContract = fs.readFileSync(path.join(projectRoot, 'docs', 'POSE_LAB_AGENT_FAILURE_CONTRACT.md'), 'utf8');
const firebaseDoc = fs.readFileSync(path.join(projectRoot, 'docs', 'FIREBASE_VISUAL_TRUTH.md'), 'utf8');
const redLedger = fs.readFileSync(path.join(projectRoot, 'evidence', 'human_visual_truth_red_builds.json'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function sourceMatch(pattern) {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
  return source.match(pattern)?.[1] || '';
}

const currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
const cacheToken = sourceMatch(/const\s+LAB_CACHE_TOKEN\s*=\s*['"]([^'"]+)['"]/);
const runtimeBuild = sourceMatch(/const\s+LAB_BUILD\s*=\s*['"]([^'"]+)['"]/);

assert(fs.existsSync(toolPath), 'visual truth preflight tool must exist');
assert(selfService.includes('tools/pose_lab_visual_truth_preflight.mjs'), 'self-service cloud loop must call the visual truth preflight');
assert(wakeScript.includes('pose_lab_visual_truth_preflight.mjs'), 'browser wake wrapper must call the visual truth preflight');
assert(captureScript.includes('autoLoadedMeshyFromColdUrl'), 'Firebase capture must record cold URL Meshy auto-load');
assert(captureScript.includes('manualActorSelectionRequiredFalse'), 'Firebase capture must record that manual Meshy actor selection was not required');
assert(captureScript.includes('synthesizeCaptureSense') && captureScript.includes('synthesizeEvidenceSense'), 'Firebase capture must write Sense Synthesis verdicts');
assert(failureContract.includes('manual Meshy Character selection') && failureContract.includes('lying evidence/UI gate'), 'failure contract must block manual actor-load false greens and enforce gate-before-FK order');
assert(firebaseDoc.includes('Manual Meshy Character selection is red') && firebaseDoc.includes('pose_lab_visual_truth_preflight.mjs'), 'Firebase doctrine must route through the visual truth preflight');
assert(redLedger.includes('22081ceb305efe1e472fff841f72be84ff303fa3') && redLedger.includes('9e809fca6610cdacc5df7a18298c03824b447a75'), 'human red-build ledger must preserve the false-green branch commit and artifact commit');
assert(redLedger.includes('manual Meshy Character') && redLedger.includes('Screenshot_20260703-125148.png') && redLedger.includes('Screenshot_20260703-125153.png'), 'human red-build ledger must preserve manual-load and latest screenshot evidence');
assert(redLedger.includes('e6cc6635631c1f1a983932d01e3233f25640e933') && redLedger.includes('28678973256'), 'human red-build ledger must preserve the latest false-green strike');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-lab-preflight-'));
for (const name of ['landing.png', 'tpose.png', 'tpose_relationship_closeup.png', 'tpose_human_read.png', 'ready.png', 'ready_relationship_closeup.png', 'ready_human_read.png', 'ready_visual_follow.png']) {
  fs.writeFileSync(path.join(tempDir, name), 'png-placeholder');
}

const baseCapture = (id, checks = {}) => ({
  id,
  actor: 'meshyCharacter',
  clip: id === 'ready'
    ? 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]'
    : id === 'tpose'
      ? '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]'
      : '',
  url: `https://pose-lab-visual-truth--fixture.web.app/pose-lab.html?mode=standard&actor=meshyCharacter&qaActor=meshyCharacter${id === 'ready' ? '&clip=OneHandReady' : ''}`,
  screenshot: path.join(tempDir, `${id}.png`),
  relationshipCloseup: id === 'landing' ? '' : path.join(tempDir, `${id}_relationship_closeup.png`),
  humanReadScreenshot: id === 'landing' ? '' : path.join(tempDir, `${id}_human_read.png`),
  contactSheet: id === 'ready' ? path.join(tempDir, 'ready_visual_follow.png') : '',
  accepted: true,
  evaluation: { ok: true, failures: [], checks },
});

const commonRouteChecks = {
  routeSelected: true,
  autoLoadedMeshyFromColdUrl: true,
  manualActorSelectionRequiredFalse: true,
  actorSelected: true,
  clipSelected: true,
  visibleUiTruthAccepted: true,
};

const goodEvidence = {
  schema: 'pose-lab-firebase-visual-truth-v1',
  authority: 'firebase-hosted-cloud-browser',
  hostedUrl: 'https://pose-lab-visual-truth--fixture.web.app',
  commit: 'pull-request-merge-sha-fixture',
  headCommit: currentCommit,
  cacheToken,
  runtimeBuild,
  ok: true,
  truthLedger: {
    cloudUrlLoaded: true,
    landingUsable: true,
    tposeStableIdle: true,
    readyBoringFk: true,
    human: true,
    senseSynthesis: true,
  },
  captures: [
    baseCapture('landing', {
      routeSelected: true,
      autoLoadedMeshyFromColdUrl: true,
      manualActorSelectionRequiredFalse: true,
      reviewClipInventoryVisible: true,
      reviewClipNotCollapsedToWalkingOnly: true,
      realWeaponVisible: true,
      visibleUiTruthAccepted: true,
    }),
    baseCapture('tpose', {
      ...commonRouteChecks,
      acceptedHiltOracle: true,
      acceptedAttachmentRotation: true,
      realWeaponVisible: true,
      hiltPinnedToSocket: true,
      tposeWristRelationshipAccepted: true,
      defaultSurfaceAccepted: true,
    }),
    baseCapture('ready', {
      ...commonRouteChecks,
      realWeaponVisible: true,
      parentChain: true,
      displayStableInSocket: true,
      modelStableInDisplay: true,
      hiltPinnedToSocket: true,
      hiltAwayFromRawHand: true,
      handLocalGripOffsetVisible: true,
      readyHandOrientationSane: true,
      readyBladeNotPointingDownThroughBody: true,
      clipScopedHiltTargetVisible: true,
      handMoves: true,
      tipMoves: true,
      tipTracksHand: true,
      basketFrontOrientationSane: true,
      socketForwardBladeAxisSane: true,
      reviewClipInventoryVisible: true,
      bodyPoseLandmarksPresent: true,
      readyVisualRelationshipAccepted: true,
    }),
  ],
};
for (const capture of goodEvidence.captures) {
  capture.cloudTelemetry = capture.id === 'ready'
    ? {
      visualFollow: { screenMetrics: { maxTipRightFromAppliedHiltPx: 101.6, maxTipDropFromAppliedHiltPx: 2.6 }, relativeDrift: {} },
      weapon: { weapon: { basketFrontErrorDeg: 12, socketForwardToBladeErrorDeg: 18 } },
    }
    : {};
  capture.senseSynthesis = synthesizeCaptureSense(capture);
  capture.visibleRead = `${capture.senseSynthesis.verdict}: ${capture.senseSynthesis.observedVisibleRelationship}`;
}
goodEvidence.senseSynthesis = synthesizeEvidenceSense(goodEvidence);
goodEvidence.truthLedger.senseSynthesis = goodEvidence.senseSynthesis.verdict === 'human-green';

const missingManualProof = JSON.parse(JSON.stringify(goodEvidence));
delete missingManualProof.captures[2].evaluation.checks.manualActorSelectionRequiredFalse;
const missingManualPath = path.join(tempDir, 'missing-manual-proof.json');
fs.writeFileSync(missingManualPath, `${JSON.stringify(missingManualProof, null, 2)}\n`);
const missingManualResult = spawnSync('node', [toolPath, '--evidence', missingManualPath, '--json'], { cwd: projectRoot, encoding: 'utf8' });
assert(missingManualResult.status !== 0, 'preflight must fail when manual Meshy actor-load proof is missing');
assert(missingManualResult.stdout.includes('manualActorSelectionRequiredFalse'), 'preflight failure must name missing manual-load proof');

const missingSense = JSON.parse(JSON.stringify(goodEvidence));
delete missingSense.senseSynthesis;
delete missingSense.captures[1].senseSynthesis;
const missingSensePath = path.join(tempDir, 'missing-sense.json');
fs.writeFileSync(missingSensePath, `${JSON.stringify(missingSense, null, 2)}\n`);
const missingSenseResult = spawnSync('node', [toolPath, '--evidence', missingSensePath, '--json'], { cwd: projectRoot, encoding: 'utf8' });
assert(missingSenseResult.status !== 0, 'preflight must fail when Sense Synthesis proof is missing');
assert(missingSenseResult.stdout.includes('Sense Synthesis'), 'preflight failure must name missing Sense Synthesis proof');

const currentRedEvidence = { ...goodEvidence, commit: '9e809fca6610cdacc5df7a18298c03824b447a75' };
const currentRedPath = path.join(tempDir, 'current-red-veto.json');
fs.writeFileSync(currentRedPath, `${JSON.stringify(currentRedEvidence, null, 2)}\n`);
const currentRedResult = spawnSync('node', [toolPath, '--evidence', currentRedPath, '--json'], { cwd: projectRoot, encoding: 'utf8' });
assert(currentRedResult.status !== 0, 'preflight must fail when the evidence commit or artifact commit is in the human red-build ledger');
assert(currentRedResult.stdout.includes('AUTHORITY_REVOKED_FALSE_GREEN'), 'preflight must name authority revocation for a human red-build veto');

const openStrikeLedger = {
  schema: 'pose-lab-human-visual-truth-red-builds-v1',
  redBuilds: [
    {
      commit: 'open-head',
      artifactCommit: 'open-artifact',
      runId: 'open-run',
      status: 'open',
      issues: ['open false green'],
    },
  ],
};
const openStrikePath = path.join(tempDir, 'open-strike-ledger.json');
fs.writeFileSync(openStrikePath, `${JSON.stringify(openStrikeLedger, null, 2)}\n`);
const openStrikeEvidence = { ...goodEvidence, commit: 'open-artifact', headCommit: currentCommit, workflowRunId: 'open-run' };
const openStrikeEvidencePath = path.join(tempDir, 'open-strike-evidence.json');
fs.writeFileSync(openStrikeEvidencePath, `${JSON.stringify(openStrikeEvidence, null, 2)}\n`);
const openStrikeResult = spawnSync('node', [toolPath, '--evidence', openStrikeEvidencePath, '--red-builds', openStrikePath, '--json'], { cwd: projectRoot, encoding: 'utf8' });
assert(openStrikeResult.status !== 0, 'open strike must block by artifact commit or workflow run id');
assert(openStrikeResult.stdout.includes('AUTHORITY_REVOKED_FALSE_GREEN'), 'open strike result must report AUTHORITY_REVOKED_FALSE_GREEN');

const supersededLedger = JSON.parse(JSON.stringify(openStrikeLedger));
supersededLedger.redBuilds[0].status = 'superseded';
supersededLedger.redBuilds[0].humanAccepted = true;
supersededLedger.redBuilds[0].supersededByCommit = currentCommit;
supersededLedger.redBuilds[0].acceptedEvidencePath = 'generated/firebase_visual_truth/latest/visual_truth.json';
const supersededPath = path.join(tempDir, 'superseded-ledger.json');
fs.writeFileSync(supersededPath, `${JSON.stringify(supersededLedger, null, 2)}\n`);
const supersededResult = spawnSync('node', [toolPath, '--evidence', openStrikeEvidencePath, '--red-builds', supersededPath, '--json'], { cwd: projectRoot, encoding: 'utf8' });
assert(supersededResult.status === 0, `properly superseded strike should not block clean evidence: ${supersededResult.stdout}`);

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-visual-truth-preflight-contract'], currentCommit }, null, 2));
