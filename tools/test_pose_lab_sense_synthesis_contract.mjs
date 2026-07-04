import { synthesizeCaptureSense, synthesizeEvidenceSense } from './pose_lab_sense_synthesis.mjs';

const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

function capture(id, checks = {}, extras = {}) {
  return {
    id,
    actor: 'meshyCharacter',
    clip: id === 'ready'
      ? 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]'
      : id === 'tpose'
        ? '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]'
        : '',
    screenshot: `generated/firebase_visual_truth/latest/${id}.png`,
    relationshipCloseup: id === 'landing' ? '' : `generated/firebase_visual_truth/latest/${id}_relationship_closeup.png`,
    humanReadScreenshot: id === 'landing' ? '' : `generated/firebase_visual_truth/latest/${id}_human_read.png`,
    contactSheet: id === 'ready' ? 'generated/firebase_visual_truth/latest/ready_visual_follow.png' : '',
    accepted: true,
    evaluation: { ok: true, failures: [], checks },
    cloudTelemetry: extras.cloudTelemetry || {},
  };
}

const landing = capture('landing', {
  routeSelected: true,
  autoLoadedMeshyFromColdUrl: true,
  manualActorSelectionRequiredFalse: true,
  reviewClipInventoryVisible: true,
  reviewClipNotCollapsedToWalkingOnly: true,
  realWeaponVisible: true,
  visibleUiTruthAccepted: true,
});

const tpose = capture('tpose', {
  routeSelected: true,
  autoLoadedMeshyFromColdUrl: true,
  manualActorSelectionRequiredFalse: true,
  actorSelected: true,
  clipSelected: true,
  acceptedHiltOracle: true,
  acceptedAttachmentRotation: true,
  realWeaponVisible: true,
  hiltPinnedToSocket: true,
  tposeWristRelationshipAccepted: true,
  defaultSurfaceAccepted: true,
  visibleUiTruthAccepted: true,
});

const ready = capture('ready', {
  routeSelected: true,
  autoLoadedMeshyFromColdUrl: true,
  manualActorSelectionRequiredFalse: true,
  actorSelected: true,
  clipSelected: true,
  realWeaponVisible: true,
  parentChain: true,
  displayStableInSocket: true,
  modelStableInDisplay: true,
  hiltPinnedToSocket: true,
  clipScopedHiltTargetVisible: true,
  handLocalGripOffsetVisible: true,
  hiltAwayFromRawHand: true,
  readyHandOrientationSane: true,
  readyBladeNotPointingDownThroughBody: true,
  handMoves: true,
  tipMoves: true,
  tipTracksHand: true,
  basketFrontOrientationSane: true,
  socketForwardBladeAxisSane: true,
  reviewClipInventoryVisible: true,
  bodyPoseLandmarksPresent: true,
  readyVisualRelationshipAccepted: true,
  visibleUiTruthAccepted: true,
}, {
  cloudTelemetry: {
    visualFollow: {
      screenMetrics: {
        maxHandToAppliedHiltPx: 34.68,
        maxTipRightFromAppliedHiltPx: 101.6,
        maxTipDropFromAppliedHiltPx: 2.6,
      },
      relativeDrift: {
        socketInHand: 0,
        displayInSocket: 0,
        modelInDisplay: 0,
      },
    },
    weapon: {
      weapon: {
        basketFrontErrorDeg: 12,
        socketForwardToBladeErrorDeg: 18,
      },
    },
  },
});

for (const item of [landing, tpose, ready]) item.senseSynthesis = synthesizeCaptureSense(item);
const green = synthesizeEvidenceSense({ captures: [landing, tpose, ready] });

assert(green.verdict === 'human-green', `complete evidence should be human-green: ${JSON.stringify(green.failures)}`);
assert(tpose.senseSynthesis.checks.heldByHandRead === true, 'T-pose sense read should treat accepted reference as hand-owned');
assert(ready.senseSynthesis.checks.heldByHandRead === true, 'Ready sense read should treat accepted Ready as hand-owned');
assert(ready.senseSynthesis.checks.bladeProjectsFromGrip === true, 'Ready sense read should require blade projection from grip');
assert(ready.senseSynthesis.vocabulary.includes('confident grip'), 'Ready green verdict should use perceptual vocabulary');
assert(ready.senseSynthesis.truth.visual && ready.senseSynthesis.truth.perceptual && ready.senseSynthesis.truth.behavioral, 'Sense Synthesis should preserve separate truth layers');

const metricGreenHumanRed = JSON.parse(JSON.stringify(ready));
metricGreenHumanRed.evaluation.checks.readyVisualRelationshipAccepted = false;
metricGreenHumanRed.evaluation.checks.readyBladeNotPointingDownThroughBody = true;
metricGreenHumanRed.senseSynthesis = synthesizeCaptureSense(metricGreenHumanRed);
assert(metricGreenHumanRed.senseSynthesis.verdict === 'human-red', 'metric-green / human-red Ready should fail Sense Synthesis');
assert(metricGreenHumanRed.senseSynthesis.vocabulary.includes('metric-green / human-red'), 'red verdict should name metric-green / human-red');

const markerOnly = JSON.parse(JSON.stringify(ready));
markerOnly.evaluation.checks.hiltAwayFromRawHand = false;
markerOnly.evaluation.checks.handLocalGripOffsetVisible = false;
markerOnly.senseSynthesis = synthesizeCaptureSense(markerOnly);
assert(markerOnly.senseSynthesis.verdict === 'human-red', 'marker-only wrist pinning should not pass Sense Synthesis');
assert(markerOnly.senseSynthesis.failures.some((failure) => failure.includes('hiltAwayFromRawHand')), 'marker-only failure should name hilt away from raw hand');

const falseGreenReady = JSON.parse(JSON.stringify(ready));
falseGreenReady.evaluation.checks.handMoves = false;
falseGreenReady.evaluation.checks.clipScopedHiltTargetVisible = false;
falseGreenReady.evaluation.checks.socketForwardBladeAxisSane = false;
falseGreenReady.cloudTelemetry.weapon.weapon.basketFrontErrorDeg = 125.81;
falseGreenReady.cloudTelemetry.weapon.weapon.socketForwardToBladeErrorDeg = 96.97;
falseGreenReady.senseSynthesis = synthesizeCaptureSense(falseGreenReady);
assert(falseGreenReady.senseSynthesis.verdict === 'human-red', 'latest false-green Ready evidence should fail Sense Synthesis');

const humanVeto = synthesizeEvidenceSense({ captures: [landing, tpose, ready], humanRedBuild: { issues: ['human screenshot says red'] } });
assert(humanVeto.verdict === 'human-red', 'human red-build veto should force aggregate Sense Synthesis red');
assert(humanVeto.failures.some((failure) => failure.includes('AUTHORITY_REVOKED_FALSE_GREEN')), 'human veto should name authority revocation');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-sense-synthesis-contract'] }, null, 2));
