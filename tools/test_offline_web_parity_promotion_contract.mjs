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
const fixedParityEvidence = {
  schema: 'pose-lab-ready-weapon-fk-offline-web-parity-gate-v1',
  cacheToken: currentCacheToken(),
  currentFixCacheToken: currentCacheToken(),
  runtimeBuild: currentRuntimeBuild(),
  actorKey: 'meshyCharacter',
  clipName: candidate.clipName,
  readyClipName: candidate.clipName,
  browserCaptureDeprecated: true,
  observedWebTruthPath: 'generated/visual_red_build/mock_observed_web_truth.json',
  observedWebTruth: { visualClass: 'sword-follows-fk' },
  offlineTruth: { visualClass: 'sword-follows-fk', transformClass: 'sword-follows-fk', visibilityClass: 'weapon-visible' },
  parity: { parityMatches: true, visualVerdict: 'fixed', parityFailure: '' },
  offlineVisualTruth: { artifactPath: 'generated/offline_visual_truth/mock/visual_truth.json', sheetPath: 'generated/offline_visual_truth/mock/visual_truth_sheet.svg', result: 'fixed' },
};
const redParityEvidence = JSON.parse(JSON.stringify(fixedParityEvidence));
redParityEvidence.parity = { parityMatches: false, visualVerdict: 'red', parityFailure: 'offline-web-visual-class-diverged' };
redParityEvidence.offlineTruth.visibilityClass = 'weapon-hidden';
redParityEvidence.offlineTruth.visualClass = 'sword-hidden';

const fixedValidation = validateCandidatePromotion({ baseline, candidate, evidence: fixedParityEvidence, metrics });
assert(fixedValidation.ok === true, `fixed parity evidence should pass validation: ${fixedValidation.errors.join('; ')}`);
const redValidation = validateCandidatePromotion({ baseline, candidate, evidence: redParityEvidence, metrics });
assert(redValidation.ok === false && redValidation.errors.some((entry) => entry.includes('visualVerdict red')), 'red parity evidence must fail validation');

const candidateFile = path.join(tmp, 'candidate.json');
const evidenceFile = path.join(tmp, 'evidence.json');
const metricsFile = path.join(tmp, 'metrics.json');
fs.writeFileSync(candidateFile, JSON.stringify(candidate, null, 2));
fs.writeFileSync(evidenceFile, JSON.stringify(fixedParityEvidence, null, 2));
fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));
const gate = spawnSync('node', ['tools/promote_pose_candidate.mjs', '--candidate', candidateFile, '--evidence', evidenceFile, '--metrics', metricsFile], {
  cwd: projectRoot,
  encoding: 'utf8',
});
assert(gate.status === 0, `fixed parity evidence should pass promote dry-run: ${gate.stderr || gate.stdout}`);
const gateReport = JSON.parse(gate.stdout);
assert(gateReport.ok === true && gateReport.apply === false, 'fixed parity dry-run should validate without applying');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['latest-parity-status-red', 'fixed-parity-promotion-accepted', 'red-parity-promotion-rejected'] }, null, 2));
