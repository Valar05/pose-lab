import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const output = execFileSync('node', [path.join(projectRoot, 'tools', 'meshy_onehand_ready_visual_parity.mjs')], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const artifactPath = path.join(projectRoot, result.path);
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(artifact.schema === 'pose-lab-meshy-onehand-ready-visual-parity-v1', `unexpected schema ${artifact.schema}`);
assert(artifact.sourceClip === 'OneHandReady', `expected OneHandReady source, got ${artifact.sourceClip}`);
assert(artifact.targetClip === 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK]', `expected active Meshy ready target, got ${artifact.targetClip}`);
assert(artifact.sourceKeyCount === 31 && artifact.leftSourceKeyCount === 31, `expected 31 authored source keys for both hands, got R=${artifact.sourceKeyCount} L=${artifact.leftSourceKeyCount}`);
assert(artifact.targetKeyCount === 30 && artifact.leftTargetKeyCount === 30, `expected generated Meshy ready clip to delete the initial rest/T-pose key, got R=${artifact.targetKeyCount} L=${artifact.leftTargetKeyCount}`);
assert(artifact.droppedInitialRestKey === true && artifact.trimmedInitialRestTime > 0, `expected the generated clip timeline to start at the first real ready key, got ${JSON.stringify({
  droppedInitialRestKey: artifact.droppedInitialRestKey,
  trimmedInitialRestTime: artifact.trimmedInitialRestTime,
})}`);
assert(fs.existsSync(path.join(projectRoot, result.sheet)), `missing visual parity contact sheet: ${result.sheet}`);

const acceptance = artifact.acceptance || {};
assert(acceptance.activeRuntimeUsesJointProjection === true, `active runtime profile is not the accepted joint-projection path: ${JSON.stringify(artifact.runtimeProfile)}`);
assert(acceptance.exactSourceKeys === true, 'source key preservation failed');
assert(acceptance.initialRestKeyDeleted === true, 'generated Meshy ready clip still includes the initial rest/T-pose key');
assert(acceptance.firstFrameReadyNotRest === true, `generated frame 0 is still too close to rest/T-pose: ${JSON.stringify({
  leftFirstFrameRestDistance: artifact.sideMetrics?.left?.firstFrameRestDistance,
  rightFirstFrameRestDistance: artifact.sideMetrics?.right?.firstFrameRestDistance,
})}`);
assert(acceptance.noTposeLeak === true, `target hand path leaks into rest/T-pose space: ${JSON.stringify({
  leftMinRestDistance: artifact.sideMetrics?.left?.minRestDistance,
  rightMinRestDistance: artifact.sideMetrics?.right?.minRestDistance,
})}`);
assert(acceptance.targetArmLengthsPreserved === true, `target arm length constraints are not preserved: ${JSON.stringify({
  leftUpper: artifact.sideMetrics?.left?.maxUpperLengthError,
  leftLower: artifact.sideMetrics?.left?.maxLowerLengthError,
  rightUpper: artifact.sideMetrics?.right?.maxUpperLengthError,
  rightLower: artifact.sideMetrics?.right?.maxLowerLengthError,
})}`);
assert(acceptance.handsSnapToSolvedProjection === true, `hands did not snap to solved constrained projection: ${JSON.stringify({
  left: artifact.sideMetrics?.left?.maxHandProjectionError,
  right: artifact.sideMetrics?.right?.maxHandProjectionError,
})}`);
assert(acceptance.rollDoesNotMoveJoints === true, `hand roll changed joint positions after IK placement: ${JSON.stringify({
  leftMaxPostRollPositionDrift: artifact.sideMetrics?.left?.maxPostRollPositionDrift,
  rightMaxPostRollPositionDrift: artifact.sideMetrics?.right?.maxPostRollPositionDrift,
})}`);
assert(acceptance.elbowBendSidePreserved === true, `elbow bend side does not match source projection: ${JSON.stringify({
  leftMinElbowBendDot: artifact.sideMetrics?.left?.minElbowBendDot,
  rightMinElbowBendDot: artifact.sideMetrics?.right?.minElbowBendDot,
})}`);
assert(acceptance.fkReadyShapeNotTpose === true, `FK ready silhouette still reads as a lateral T/A-pose instead of a guard: ${JSON.stringify({
  leftFirstFrameForearmReturnMargin: artifact.sideMetrics?.left?.firstFrameForearmReturnMargin,
  leftMinForearmReturnMargin: artifact.sideMetrics?.left?.minForearmReturnMargin,
  rightFirstFrameForearmReturnMargin: artifact.sideMetrics?.right?.firstFrameForearmReturnMargin,
  rightMinForearmReturnMargin: artifact.sideMetrics?.right?.minForearmReturnMargin,
})}`);
assert(acceptance.leftDownRollNotInverted === true, `left down-vector roll axis is inverted relative to FPS source rest delta: ${JSON.stringify({
  leftMinDownRollDot: artifact.sideMetrics?.left?.minDownRollDot,
})}`);
assert(acceptance.leftDownRollErrorBounded === true, `left down-vector roll error is visibly too high: ${JSON.stringify({
  leftMaxDownRollErrorDeg: artifact.sideMetrics?.left?.maxDownRollErrorDeg,
})}`);
assert(acceptance.rightHandTwistMinimal === true, `right hand should not need a large roll correction: ${JSON.stringify({
  rightMaxAppliedTwistDeg: artifact.sideMetrics?.right?.maxAppliedTwistDeg,
  rightMaxUnclampedTwistDeg: artifact.sideMetrics?.right?.maxUnclampedTwistDeg,
})}`);
assert(acceptance.leftHandTwistBounded === true, `left hand roll solve is twisting the joint too far: ${JSON.stringify({
  leftMaxAppliedTwistDeg: artifact.sideMetrics?.left?.maxAppliedTwistDeg,
  leftMaxUnclampedTwistDeg: artifact.sideMetrics?.left?.maxUnclampedTwistDeg,
})}`);
assert(acceptance.leftHandMaintainsPosition === true, `left hand has a sudden world-position step: ${JSON.stringify({
  leftMaxTargetStepTravel: artifact.sideMetrics?.left?.maxTargetStepTravel,
  leftMaxSourceStepTravel: artifact.sideMetrics?.left?.maxSourceStepTravel,
  leftTargetScale: artifact.sideMetrics?.left?.targetScale,
})}`);
assert(acceptance.noLoopSnap === true, `target loop snap exceeds source loop motion: ${JSON.stringify({
  leftTargetLoopDelta: artifact.sideMetrics?.left?.targetLoopDelta,
  rightTargetLoopDelta: artifact.sideMetrics?.right?.targetLoopDelta,
})}`);
assert(acceptance.realSabreMeasured === true, `real Meshy sabre bounds were not measured correctly: ${JSON.stringify(artifact.sabreBounds)}`);

if (failures.length) {
  throw new Error([
    'Meshy OneHandReady visual parity failed.',
    `Artifact: ${path.relative(projectRoot, artifactPath)}`,
    `Sheet: ${result.sheet}`,
    ...failures,
  ].join('\n'));
}

console.log(JSON.stringify({
  checked: ['meshy-onehand-ready-source-relative-visual-parity'],
  artifact: path.relative(projectRoot, artifactPath),
  sheet: result.sheet,
  sideMetrics: artifact.sideMetrics,
}, null, 2));
