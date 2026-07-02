import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  baselinePath,
  currentCacheToken,
  currentRuntimeBuild,
  latestEvidenceStatus,
  projectRoot,
  readJson,
  validateCandidatePromotion,
} from './pose_lab_workflow_lib.mjs';

const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function validate(evidence, candidate, metrics, baseline) {
  return validateCandidatePromotion({ baseline, candidate, evidence, metrics });
}

const baseline = readJson(baselinePath);
const latest = latestEvidenceStatus();
assert(latest.path.endsWith('meshy_ready_weapon_fk_follow_latest.json'), 'latest evidence should point at Meshy Ready parity gate');
assert(latest.evidence?.promotionVerdict?.visualVerdict === 'fixed', 'latest Ready candidate evidence should now have fixed machine gates');
assert(latest.evidence?.observedTruth?.authority === 'context-only', 'latest Ready evidence should keep observed truth context-only');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-lab-parity-promotion-'));
const candidate = {
  status: 'candidate-only',
  promotable: false,
  actorKey: 'meshyCharacter',
  clipName: 'OneHandReady -> meshyCharacter [READY-GATED-MOCK]',
  weaponIncluded: true,
};
const metrics = {
  schema: 'pose-lab-promotion-metrics-v1',
  actorKey: 'meshyCharacter',
  clipName: candidate.clipName,
  weaponIncluded: true,
  assertions: {
    beatsOrPreservesBaseline: true,
    noTposeLeak: true,
    armLengthPreserved: true,
    handPositionSane: true,
    rollDoesNotMoveJoints: true,
    saberGripAtHandCenter: true,
    basketHiltFacesAwayFromBody: true,
    bladeLongAxisSane: true,
  },
};
const observedPath = path.join(tmp, 'observed.json');
const artifactPath = path.join(tmp, 'visual_truth.json');
const sheetPath = path.join(tmp, 'visual_truth_sheet.svg');
const observedWebTruth = {
  schema: 'pose-lab-ready-weapon-fk-observed-web-truth-v1',
  cacheToken: currentCacheToken(),
  runtimeBuild: currentRuntimeBuild(),
  actorKey: 'meshyCharacter',
  clipName: candidate.clipName,
  visualClass: 'sword-rest-space',
  evidenceSource: 'mock-human-context-only-report',
  browserCaptureDeprecated: true,
  capturePaths: [path.join(tmp, 'mock-context-capture.png')],
  visualRead: 'Mock human report intentionally remains red; promotion must ignore this as authority.',
  visualAssertions: {
    tPoseWeaponPlacementAccepted: true,
    readyHandsCorrected: true,
    readySwordNotFollowingFinalFk: true,
    browserCaptureRejectedAsAcceptance: true,
    expectedReadySwordFollowsFinalFk: true,
  },
};
const observedTruth = {
  authority: 'context-only',
  present: true,
  schema: observedWebTruth.schema,
  visualClass: observedWebTruth.visualClass,
  visualRead: observedWebTruth.visualRead,
  capturePaths: observedWebTruth.capturePaths,
  cacheToken: observedWebTruth.cacheToken,
  runtimeBuild: observedWebTruth.runtimeBuild,
};
const visibilityGate = {
  status: 'pass',
  visible: true,
  visibilityClass: 'weapon-visible',
  matchedPattern: '\\[FPS-VISUAL-IK',
  patterns: ['\\[FPS-VISUAL-IK'],
  reasons: ['visible-pattern:\\[FPS-VISUAL-IK'],
  blockingReasons: [],
};
const transformGate = {
  status: 'pass',
  transformClass: 'sword-follows-fk',
  reasons: [],
  blockingReasons: [],
  thresholds: { maxHiltToHand: 0.18, minBladeAxisChangeDeg: 20, maxSocketHandQuaternionErrorDeg: 0.5 },
  metrics: { hiltToHandDistance: 0.11, bladeAxisChangeFromRestDeg: 97.2, socketToHandQuaternionErrorDeg: 0.1 },
  coordinates: {
    ready: { hilt: [0, 0, 0], tip: [0, 1, 0], bladeAxis: [0, 1, 0], socketPosition: [0, 0, 0], socketQuaternion: [0, 0, 0, 1] },
    rest: { hilt: [0, 0, 0], tip: [1, 0, 0], bladeAxis: [1, 0, 0], socketPosition: [0, 0, 0], socketQuaternion: [0, 0, 0, 1] },
  },
  deltas: { hiltToHandDistance: 0.11, bladeAxisChangeFromRestDeg: 97.2, socketToHandQuaternionErrorDeg: 0.1 },
};
const promotionVerdict = {
  authority: 'offline-machine-gates',
  observedTruthAuthority: 'context-only',
  parityMatches: true,
  machineGatesPass: true,
  visualVerdict: 'fixed',
  parityFailure: '',
  visibilityGate,
  transformGate,
  observedTruth,
};
fs.writeFileSync(observedWebTruth.capturePaths[0], 'mock context capture\n');
writeJson(observedPath, observedWebTruth);
fs.writeFileSync(sheetPath, '<svg xmlns="http://www.w3.org/2000/svg"><text>fixed machine gates mock</text></svg>\n');
const fixedParityEvidence = {
  schema: 'pose-lab-ready-weapon-fk-offline-web-parity-gate-v1',
  cacheToken: currentCacheToken(),
  currentFixCacheToken: currentCacheToken(),
  runtimeBuild: currentRuntimeBuild(),
  actorKey: 'meshyCharacter',
  clipName: candidate.clipName,
  readyClipName: candidate.clipName,
  browserCaptureDeprecated: true,
  observedWebTruthPath: observedPath,
  observedWebTruth,
  observedTruth,
  offlineTruth: { visualClass: 'sword-follows-fk', transformClass: 'sword-follows-fk', visibilityClass: 'weapon-visible', visibilityGate, transformGate },
  visibilityGate,
  transformGate,
  promotionVerdict,
  parity: promotionVerdict,
  offlineVisualTruth: { artifactPath, sheetPath, result: 'fixed' },
};
const offlineArtifact = {
  schema: 'pose-lab-offline-web-truth-parity-ready-weapon-fk-v1',
  cacheToken: fixedParityEvidence.cacheToken,
  runtimeBuild: fixedParityEvidence.runtimeBuild,
  actorKey: fixedParityEvidence.actorKey,
  clipName: fixedParityEvidence.clipName,
  observedWebTruthPath: fixedParityEvidence.observedWebTruthPath,
  observedWebTruth: fixedParityEvidence.observedWebTruth,
  observedTruth: fixedParityEvidence.observedTruth,
  offlineTruth: fixedParityEvidence.offlineTruth,
  visibilityGate: fixedParityEvidence.visibilityGate,
  transformGate: fixedParityEvidence.transformGate,
  promotionVerdict: fixedParityEvidence.promotionVerdict,
  parity: fixedParityEvidence.parity,
  result: fixedParityEvidence.offlineVisualTruth.result,
  sheet: fixedParityEvidence.offlineVisualTruth.sheetPath,
};
writeJson(artifactPath, offlineArtifact);

const fixedValidation = validate(fixedParityEvidence, candidate, metrics, baseline);
assert(fixedValidation.ok === true, `fixed machine-gate evidence should pass validation even with red observed context: ${fixedValidation.errors.join('; ')}`);

const hiddenVisibilityEvidence = clone(fixedParityEvidence);
hiddenVisibilityEvidence.visibilityGate.status = 'fail';
hiddenVisibilityEvidence.visibilityGate.visible = false;
hiddenVisibilityEvidence.visibilityGate.visibilityClass = 'weapon-hidden';
hiddenVisibilityEvidence.offlineTruth.visibilityClass = 'weapon-hidden';
hiddenVisibilityEvidence.offlineTruth.visibilityGate = hiddenVisibilityEvidence.visibilityGate;
hiddenVisibilityEvidence.promotionVerdict.visualVerdict = 'red';
hiddenVisibilityEvidence.promotionVerdict.machineGatesPass = false;
hiddenVisibilityEvidence.parity = hiddenVisibilityEvidence.promotionVerdict;
const hiddenValidation = validate(hiddenVisibilityEvidence, candidate, metrics, baseline);
assert(hiddenValidation.ok === false && hiddenValidation.errors.some((entry) => entry.includes('visibility gate')), 'hidden offline visibility must fail validation');

const blockedTransformEvidence = clone(fixedParityEvidence);
blockedTransformEvidence.transformGate.status = 'blocked';
blockedTransformEvidence.promotionVerdict.visualVerdict = 'red';
blockedTransformEvidence.promotionVerdict.machineGatesPass = false;
blockedTransformEvidence.parity = blockedTransformEvidence.promotionVerdict;
blockedTransformEvidence.offlineTruth.transformGate = blockedTransformEvidence.transformGate;
const blockedValidation = validate(blockedTransformEvidence, candidate, metrics, baseline);
assert(blockedValidation.ok === false && blockedValidation.errors.some((entry) => entry.includes('transform gate')), 'blocked offline transform must fail validation');

const missingObserved = clone(fixedParityEvidence);
missingObserved.observedWebTruthPath = path.join(tmp, 'missing-observed.json');
assert(validate(missingObserved, candidate, metrics, baseline).errors.some((entry) => entry.includes('observedWebTruthPath does not exist')), 'missing observed truth context file must fail');

const mismatchedObserved = clone(fixedParityEvidence);
const mismatchObservedPath = path.join(tmp, 'mismatch-observed.json');
writeJson(mismatchObservedPath, { ...observedWebTruth, visualClass: 'sword-follows-fk' });
mismatchedObserved.observedWebTruthPath = mismatchObservedPath;
assert(validate(mismatchedObserved, candidate, metrics, baseline).errors.some((entry) => entry.includes('embedded observedWebTruth does not match')), 'mismatched observed truth file must fail readback');

const missingArtifact = clone(fixedParityEvidence);
missingArtifact.offlineVisualTruth.artifactPath = path.join(tmp, 'missing-artifact.json');
assert(validate(missingArtifact, candidate, metrics, baseline).errors.some((entry) => entry.includes('offlineVisualTruth.artifactPath does not exist')), 'missing offline artifact must fail');

const mismatchedArtifact = clone(fixedParityEvidence);
const mismatchArtifactPath = path.join(tmp, 'mismatch-artifact.json');
writeJson(mismatchArtifactPath, { ...offlineArtifact, visibilityGate: { ...offlineArtifact.visibilityGate, status: 'fail' } });
mismatchedArtifact.offlineVisualTruth.artifactPath = mismatchArtifactPath;
assert(validate(mismatchedArtifact, candidate, metrics, baseline).errors.some((entry) => entry.includes('offline artifact visibilityGate does not match')), 'mismatched offline artifact visibilityGate must fail');

const missingSheet = clone(fixedParityEvidence);
missingSheet.offlineVisualTruth.sheetPath = path.join(tmp, 'missing-sheet.svg');
assert(validate(missingSheet, candidate, metrics, baseline).errors.some((entry) => entry.includes('sheetPath does not exist')), 'missing sheet must fail');

const emptySheet = clone(fixedParityEvidence);
const emptySheetPath = path.join(tmp, 'empty-sheet.svg');
fs.writeFileSync(emptySheetPath, '');
emptySheet.offlineVisualTruth.sheetPath = emptySheetPath;
assert(validate(emptySheet, candidate, metrics, baseline).errors.some((entry) => entry.includes('sheetPath is empty')), 'empty sheet must fail');

const candidateFile = path.join(tmp, 'candidate.json');
const evidenceFile = path.join(tmp, 'evidence.json');
const metricsFile = path.join(tmp, 'metrics.json');
writeJson(candidateFile, candidate);
writeJson(evidenceFile, fixedParityEvidence);
writeJson(metricsFile, metrics);
const gate = spawnSync('node', ['tools/promote_pose_candidate.mjs', '--candidate', candidateFile, '--evidence', evidenceFile, '--metrics', metricsFile], {
  cwd: projectRoot,
  encoding: 'utf8',
});
assert(gate.status === 0, `fixed machine-gate evidence should pass promote dry-run: ${gate.stderr || gate.stdout}`);
const gateReport = JSON.parse(gate.stdout);
assert(gateReport.ok === true && gateReport.apply === false, 'fixed parity dry-run should validate without applying');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['latest-parity-status-fixed', 'fixed-machine-gates-promotion-accepted', 'visibility-and-transform-gates-required', 'observed-truth-context-only'] }, null, 2));
