import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  baselinePath,
  compareSelectionSurfaces,
  currentCacheToken,
  currentMeshySelectionSurfaces,
  currentRuntimeBuild,
  latestEvidenceStatus,
  projectRoot,
  readJson,
  validateCandidatePromotion,
} from './pose_lab_workflow_lib.mjs';

const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const baseline = readJson(baselinePath);
assert(baseline.schema === 'pose-lab-accepted-baseline-v1', 'baseline manifest should use accepted-baseline schema');
assert(baseline.actorKey === 'meshyCharacter', 'baseline should protect Meshy Character');
assert(baseline.acceptedClip.includes('[FPS-REST-ARMS roll -120]'), 'baseline should protect the accepted -120 rest calibration');
assert(baseline.promotionRules?.requiresFreshVisualEvidence === true, 'baseline should require fresh visual evidence');
assert(baseline.promotionRules?.requiresMetricEvidence === true, 'baseline should require metric evidence');

const selectionMismatches = compareSelectionSurfaces(baseline, currentMeshySelectionSurfaces());
assert(selectionMismatches.length === 0, `protected selection surfaces drifted: ${JSON.stringify(selectionMismatches)}`);

const statusRaw = execFileSync('node', ['tools/pose_lab_workflow_status.mjs'], { cwd: projectRoot, encoding: 'utf8' });
const status = JSON.parse(statusRaw);
assert(status.schema === 'pose-lab-workflow-status-v1', 'status should report workflow schema');
assert(status.gate?.okToPromote === false, 'status should never mark promotion open without gate evidence');
assert(Array.isArray(status.gate?.latestEvidence?.errors), 'status should explain latest evidence health');

const stale = latestEvidenceStatus();
assert(stale.errors.length >= 1, 'current latest evidence should not silently count as promotion evidence');

const staleCandidate = {
  status: 'candidate-only',
  promotable: false,
  actorKey: 'meshyCharacter',
  clipName: baseline.acceptedClip,
};
const staleMetrics = {
  schema: 'pose-lab-promotion-metrics-v1',
  actorKey: 'meshyCharacter',
  clipName: baseline.acceptedClip,
  assertions: {
    beatsOrPreservesBaseline: true,
    noTposeLeak: true,
    armLengthPreserved: true,
    handPositionSane: true,
    rollDoesNotMoveJoints: true,
  },
};
const staleValidation = validateCandidatePromotion({
  baseline,
  candidate: staleCandidate,
  evidence: stale.evidence || {},
  metrics: staleMetrics,
});
assert(staleValidation.ok === false, 'stale or blocked visual evidence must fail promotion validation');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-lab-promotion-'));
const passingCandidate = {
  status: 'candidate-only',
  promotable: false,
  actorKey: 'meshyCharacter',
  clipName: 'OneHandReady -> meshyCharacter [READY-GATED-MOCK]',
  weaponIncluded: true,
};
const passingEvidence = {
  schema: 'pose-lab-visual-evidence-v1',
  cacheToken: currentCacheToken(),
  runtimeBuild: currentRuntimeBuild(),
  actorKey: 'meshyCharacter',
  clipName: 'OneHandReady -> meshyCharacter [READY-GATED-MOCK]',
  captureKind: 'android-screenshot',
  capturePath: '',
  visualRead: 'Mock visual read for gate validation: candidate is visible, sane, and compared against the accepted baseline.',
  motionEvidencePending: false,
  liveVisualQa: { status: 'ok' },
};
const passingMetrics = {
  schema: 'pose-lab-promotion-metrics-v1',
  actorKey: 'meshyCharacter',
  clipName: 'OneHandReady -> meshyCharacter [READY-GATED-MOCK]',
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
const candidateFile = path.join(tmp, 'candidate.json');
const evidenceFile = path.join(tmp, 'evidence.json');
const metricsFile = path.join(tmp, 'metrics.json');
const captureFile = path.join(tmp, 'mock-passing-screenshot.png');
fs.writeFileSync(captureFile, 'mock capture placeholder\n');
passingEvidence.capturePath = captureFile;
fs.writeFileSync(candidateFile, JSON.stringify(passingCandidate, null, 2));
fs.writeFileSync(evidenceFile, JSON.stringify(passingEvidence, null, 2));
fs.writeFileSync(metricsFile, JSON.stringify(passingMetrics, null, 2));

const gate = spawnSync('node', ['tools/promote_pose_candidate.mjs', '--candidate', candidateFile, '--evidence', evidenceFile, '--metrics', metricsFile], {
  cwd: projectRoot,
  encoding: 'utf8',
});
assert(gate.status === 0, `mock passing candidate should pass dry-run promotion gate: ${gate.stderr || gate.stdout}`);
const gateReport = JSON.parse(gate.stdout);
assert(gateReport.ok === true && gateReport.apply === false, 'dry-run promotion should validate without applying');
assert(!fs.existsSync(path.join(projectRoot, 'generated', 'workflow_state', 'latest_promotion_attempt.json')), 'dry-run gate must not write promotion attempt state');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['accepted-baseline-protected', 'stale-evidence-rejected', 'mock-fresh-gate-passes'] }, null, 2));
