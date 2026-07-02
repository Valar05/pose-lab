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
assert(latest.errors.some((entry) => entry.includes('parity evidence is red')), 'current red parity evidence should block promotion status');

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
  visualClass: 'sword-follows-fk',
  evidenceSource: 'mock-human-approved-fixed-parity',
  browserCaptureDeprecated: true,
  capturePaths: [path.join(tmp, 'mock-fixed-capture.png')],
  visualRead: 'Mock fixed visual truth for promotion validation: Ready sword visibly follows final FK.',
  visualAssertions: {
    tPoseWeaponPlacementAccepted: true,
    readyHandsCorrected: true,
    readySwordNotFollowingFinalFk: false,
    browserCaptureRejectedAsAcceptance: true,
    expectedReadySwordFollowsFinalFk: true,
  },
};
fs.writeFileSync(observedWebTruth.capturePaths[0], 'mock fixed capture\n');
writeJson(observedPath, observedWebTruth);
fs.writeFileSync(sheetPath, '<svg xmlns="http://www.w3.org/2000/svg"><text>fixed parity mock</text></svg>\n');
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
  offlineTruth: { visualClass: 'sword-follows-fk', transformClass: 'sword-follows-fk', visibilityClass: 'weapon-visible' },
  parity: { parityMatches: true, visualVerdict: 'fixed', parityFailure: '' },
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
  offlineTruth: fixedParityEvidence.offlineTruth,
  parity: fixedParityEvidence.parity,
  result: fixedParityEvidence.offlineVisualTruth.result,
  sheet: fixedParityEvidence.offlineVisualTruth.sheetPath,
};
writeJson(artifactPath, offlineArtifact);

const fixedValidation = validate(fixedParityEvidence, candidate, metrics, baseline);
assert(fixedValidation.ok === true, `fixed parity evidence should pass validation: ${fixedValidation.errors.join('; ')}`);

const redParityEvidence = clone(fixedParityEvidence);
redParityEvidence.parity = { parityMatches: false, visualVerdict: 'red', parityFailure: 'offline-web-visual-class-diverged' };
redParityEvidence.offlineTruth.visibilityClass = 'weapon-hidden';
redParityEvidence.offlineTruth.visualClass = 'sword-hidden';
const redValidation = validate(redParityEvidence, candidate, metrics, baseline);
assert(redValidation.ok === false && redValidation.errors.some((entry) => entry.includes('visualVerdict red')), 'red parity evidence must fail validation');

const missingObserved = clone(fixedParityEvidence);
missingObserved.observedWebTruthPath = path.join(tmp, 'missing-observed.json');
assert(validate(missingObserved, candidate, metrics, baseline).errors.some((entry) => entry.includes('observedWebTruthPath does not exist')), 'missing observed truth file must fail');

const mismatchedObserved = clone(fixedParityEvidence);
const mismatchObservedPath = path.join(tmp, 'mismatch-observed.json');
writeJson(mismatchObservedPath, { ...observedWebTruth, visualClass: 'sword-rest-space' });
mismatchedObserved.observedWebTruthPath = mismatchObservedPath;
assert(validate(mismatchedObserved, candidate, metrics, baseline).errors.some((entry) => entry.includes('embedded observedWebTruth does not match')), 'mismatched observed truth file must fail');

const missingArtifact = clone(fixedParityEvidence);
missingArtifact.offlineVisualTruth.artifactPath = path.join(tmp, 'missing-artifact.json');
assert(validate(missingArtifact, candidate, metrics, baseline).errors.some((entry) => entry.includes('offlineVisualTruth.artifactPath does not exist')), 'missing offline artifact must fail');

const mismatchedArtifact = clone(fixedParityEvidence);
const mismatchArtifactPath = path.join(tmp, 'mismatch-artifact.json');
writeJson(mismatchArtifactPath, { ...offlineArtifact, offlineTruth: { ...offlineArtifact.offlineTruth, visibilityClass: 'weapon-hidden' } });
mismatchedArtifact.offlineVisualTruth.artifactPath = mismatchArtifactPath;
assert(validate(mismatchedArtifact, candidate, metrics, baseline).errors.some((entry) => entry.includes('offline artifact offlineTruth does not match')), 'mismatched offline artifact must fail');

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
assert(gate.status === 0, `fixed parity evidence should pass promote dry-run: ${gate.stderr || gate.stdout}`);
const gateReport = JSON.parse(gate.stdout);
assert(gateReport.ok === true && gateReport.apply === false, 'fixed parity dry-run should validate without applying');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['latest-parity-status-red', 'fixed-parity-promotion-accepted', 'red-parity-promotion-rejected', 'linked-parity-artifacts-required'] }, null, 2));
