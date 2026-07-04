#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SENSE_SYNTHESIS_SCHEMA, synthesizeEvidenceSense } from './pose_lab_sense_synthesis.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultEvidencePath = path.join(projectRoot, 'generated', 'firebase_visual_truth', 'latest', 'visual_truth.json');
let humanRedBuildsPath = path.join(projectRoot, 'evidence', 'human_visual_truth_red_builds.json');

function parseArgs(argv) {
  const args = { evidence: defaultEvidencePath, redBuilds: humanRedBuildsPath, json: false, help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--evidence') args.evidence = path.resolve(projectRoot, String(argv[++i] || ''));
    else if (arg.startsWith('--evidence=')) args.evidence = path.resolve(projectRoot, arg.slice('--evidence='.length));
    else if (arg === '--red-builds') args.redBuilds = path.resolve(projectRoot, String(argv[++i] || ''));
    else if (arg.startsWith('--red-builds=')) args.redBuilds = path.resolve(projectRoot, arg.slice('--red-builds='.length));
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    'Usage: node tools/pose_lab_visual_truth_preflight.mjs [--evidence PATH] [--json]',
    '',
    'Hard preflight for Meshy cloud visual truth. It blocks browser wake and green language',
    'when the current artifact is stale, human-red, route-hydration-red, manual-load-red,',
    'or marker/telemetry-green while the visible relationship is not explicitly accepted.',
  ].join('\n');
}

function readText(relPath) {
  return fs.readFileSync(path.join(projectRoot, relPath), 'utf8');
}

function currentCacheToken() {
  return readText('src/pose-lab.js').match(/const\s+LAB_CACHE_TOKEN\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

function currentRuntimeBuild() {
  return readText('src/pose-lab.js').match(/const\s+LAB_BUILD\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

function currentCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch (_error) {
    return '';
  }
}

function normalizeUrl(value = '') {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch (_error) {
    return String(value).replace(/\/$/, '');
  }
}

function identifierMatches(identifier = '', candidate = '') {
  if (!identifier || !candidate) return false;
  const left = String(identifier);
  const right = String(candidate);
  if (/^https?:\/\//.test(left) || /^https?:\/\//.test(right)) return normalizeUrl(left) === normalizeUrl(right);
  return left === right || left.startsWith(right) || right.startsWith(left);
}

function commitMatches(a = '', b = '') {
  if (!a || !b) return false;
  return String(a).startsWith(String(b)) || String(b).startsWith(String(a));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function relativeArtifactDir(evidencePath) {
  return path.dirname(evidencePath);
}

function resolveArtifactFile(evidencePath, value = '') {
  if (!value) return '';
  if (path.isAbsolute(value)) return value;
  const fromRoot = path.join(projectRoot, value);
  if (fs.existsSync(fromRoot)) return fromRoot;
  return path.join(relativeArtifactDir(evidencePath), value);
}

function redBuildClosed(entry) {
  return entry?.status === 'superseded'
    && entry?.humanAccepted === true
    && Boolean(entry?.supersededByCommit)
    && Boolean(entry?.acceptedEvidencePath);
}

function redBuildIdentifiers(entry = {}) {
  return [
    entry.commit,
    entry.artifactCommit,
    entry.headCommit,
    entry.runId,
    entry.firebaseRunId,
    entry.workflowRunId,
    entry.url,
    entry.hostedUrl,
    ...(Array.isArray(entry.urls) ? entry.urls : []),
  ].map((value) => String(value || '')).filter(Boolean);
}

function humanRedBuildsFor(candidates) {
  if (!fs.existsSync(humanRedBuildsPath)) return null;
  const payload = readJson(humanRedBuildsPath);
  const builds = Array.isArray(payload?.redBuilds) ? payload.redBuilds : [];
  const active = builds.filter((entry) => !redBuildClosed(entry));
  return active.filter((entry) => {
    const identifiers = redBuildIdentifiers(entry);
    return candidates.some((candidate) => identifiers.some((identifier) => identifierMatches(identifier, candidate)));
  });
}

function capture(evidence, id) {
  return evidence?.captures?.find((entry) => entry.id === id) || null;
}

function checkCaptureFiles(evidencePath, captureEntry, names, failures) {
  for (const name of names) {
    const file = resolveArtifactFile(evidencePath, captureEntry?.[name] || '');
    if (!file || !fs.existsSync(file)) failures.push(`${captureEntry?.id || 'capture'} missing readable ${name} PNG`);
  }
}

function requireCheck(captureEntry, key, failures, label = captureEntry?.id || 'capture') {
  if (captureEntry?.evaluation?.checks?.[key] !== true) failures.push(`${label} check failed or missing: ${key}`);
}

function requireSenseSynthesis(evidence, failures) {
  const sense = evidence?.senseSynthesis || null;
  if (!sense) {
    failures.push('missing top-level Sense Synthesis verdict');
    return;
  }
  if (sense.schema !== SENSE_SYNTHESIS_SCHEMA) failures.push(`unexpected Sense Synthesis schema: ${sense.schema || 'missing'}`);
  if (sense.verdict !== 'human-green') failures.push(`Sense Synthesis verdict is not human-green: ${sense.verdict || 'missing'}`);
  if (!Array.isArray(sense.captures) || sense.captures.length < 3) failures.push('Sense Synthesis must include landing, T-pose, and Ready capture verdicts');
  const recomputed = synthesizeEvidenceSense(evidence);
  if (recomputed.verdict !== 'human-green') {
    failures.push(`recomputed Sense Synthesis is ${recomputed.verdict}: ${recomputed.failures.join('; ')}`);
  }
  for (const id of ['landing', 'tpose', 'ready']) {
    const captureEntry = capture(evidence, id);
    const captureSense = captureEntry?.senseSynthesis || null;
    if (!captureSense) failures.push(`${id} missing capture Sense Synthesis verdict`);
    else if (captureSense.schema !== SENSE_SYNTHESIS_SCHEMA) failures.push(`${id} Sense Synthesis schema mismatch: ${captureSense.schema || 'missing'}`);
    else if (captureSense.verdict !== 'human-green') failures.push(`${id} Sense Synthesis verdict is not human-green: ${captureSense.verdict}`);
  }
}

const args = parseArgs(process.argv);
humanRedBuildsPath = args.redBuilds;
if (args.help) {
  console.log(usage());
  process.exit(0);
}

const failures = [];
let evidence = null;
if (!fs.existsSync(args.evidence)) {
  failures.push(`missing visual truth evidence: ${args.evidence}`);
} else {
  try {
    evidence = readJson(args.evidence);
  } catch (error) {
    failures.push(`invalid visual truth evidence JSON: ${error.message}`);
  }
}

const localCommit = currentCommit();
if (evidence) {
  const readyCapture = capture(evidence, 'ready');
  const redBuilds = humanRedBuildsFor([
    localCommit,
    evidence.commit,
    evidence.headCommit,
    evidence.runId,
    evidence.workflowRunId,
    evidence.workflow?.runId,
    evidence.hostedUrl,
    readyCapture?.url,
  ].filter(Boolean));
  if (redBuilds?.length) {
    for (const redBuild of redBuilds) {
      failures.push(`AUTHORITY_REVOKED_FALSE_GREEN: human red-build veto for commit ${redBuild.commit || 'unknown'} / artifact ${redBuild.artifactCommit || 'unknown'} / run ${redBuild.runId || redBuild.firebaseRunId || redBuild.workflowRunId || 'unknown'}: ${(redBuild.issues || []).join('; ')}`);
    }
  }
  if (evidence.schema !== 'pose-lab-firebase-visual-truth-v1') failures.push(`unexpected schema: ${evidence.schema || 'missing'}`);
  if (evidence.authority !== 'firebase-hosted-cloud-browser') failures.push(`unexpected authority: ${evidence.authority || 'missing'}`);
  if (evidence.cacheToken !== currentCacheToken()) failures.push(`stale cache token: artifact=${evidence.cacheToken || 'missing'} current=${currentCacheToken()}`);
  if (evidence.runtimeBuild !== currentRuntimeBuild()) failures.push(`stale runtime build: artifact=${evidence.runtimeBuild || 'missing'} current=${currentRuntimeBuild()}`);
  if (!commitMatches(localCommit, evidence.commit) && !commitMatches(localCommit, evidence.headCommit)) {
    failures.push(`artifact commit does not match current checkout: artifact=${evidence.commit || 'missing'} head=${evidence.headCommit || 'missing'} current=${localCommit || 'missing'}`);
  }
  if (evidence.ok !== true) failures.push('visual_truth.ok is not true');
  requireSenseSynthesis(evidence, failures);
  for (const [key, expected] of Object.entries({
    cloudUrlLoaded: true,
    landingUsable: true,
    tposeStableIdle: true,
    readyBoringFk: true,
    human: true,
    senseSynthesis: true,
  })) {
    if (evidence.truthLedger?.[key] !== expected) failures.push(`truthLedger.${key} is not true`);
  }

  const landing = capture(evidence, 'landing');
  const tpose = capture(evidence, 'tpose');
  const ready = capture(evidence, 'ready');
  if (!landing) failures.push('missing landing capture');
  if (!tpose) failures.push('missing tpose capture');
  if (!ready) failures.push('missing ready capture');

  if (landing) {
    if (landing.accepted !== true) failures.push('landing capture is not accepted');
    if (!landing.url?.startsWith('https://pose-lab-visual-truth')) failures.push('landing URL is not hosted Firebase visual truth');
    requireCheck(landing, 'routeSelected', failures);
    requireCheck(landing, 'autoLoadedMeshyFromColdUrl', failures);
    requireCheck(landing, 'manualActorSelectionRequiredFalse', failures);
    requireCheck(landing, 'reviewClipInventoryVisible', failures);
    requireCheck(landing, 'reviewClipNotCollapsedToWalkingOnly', failures);
    requireCheck(landing, 'realWeaponVisible', failures);
    requireCheck(landing, 'visibleUiTruthAccepted', failures);
    checkCaptureFiles(args.evidence, landing, ['screenshot'], failures);
  }

  if (tpose) {
    if (tpose.accepted !== true) failures.push('T-pose capture is not accepted');
    if (tpose.clip !== '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]') failures.push(`T-pose clip mismatch: ${tpose.clip || 'missing'}`);
    requireCheck(tpose, 'routeSelected', failures, 'T-pose');
    requireCheck(tpose, 'autoLoadedMeshyFromColdUrl', failures, 'T-pose');
    requireCheck(tpose, 'manualActorSelectionRequiredFalse', failures, 'T-pose');
    requireCheck(tpose, 'actorSelected', failures, 'T-pose');
    requireCheck(tpose, 'clipSelected', failures, 'T-pose');
    requireCheck(tpose, 'acceptedHiltOracle', failures, 'T-pose');
    requireCheck(tpose, 'acceptedAttachmentRotation', failures, 'T-pose');
    requireCheck(tpose, 'realWeaponVisible', failures, 'T-pose');
    requireCheck(tpose, 'tposeWristRelationshipAccepted', failures, 'T-pose');
    requireCheck(tpose, 'defaultSurfaceAccepted', failures, 'T-pose');
    requireCheck(tpose, 'visibleUiTruthAccepted', failures, 'T-pose');
    checkCaptureFiles(args.evidence, tpose, ['screenshot', 'relationshipCloseup'], failures);
  }

  if (ready) {
    if (ready.accepted !== true) failures.push('Ready capture is not accepted');
    if (ready.clip !== 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]') failures.push(`Ready clip mismatch: ${ready.clip || 'missing'}`);
    if (!ready.url || ready.url === evidence.hostedUrl || !ready.url.includes('/pose-lab.html?')) failures.push('Ready capture URL is missing exact route query');
    requireCheck(ready, 'routeSelected', failures, 'Ready');
    requireCheck(ready, 'autoLoadedMeshyFromColdUrl', failures, 'Ready');
    requireCheck(ready, 'manualActorSelectionRequiredFalse', failures, 'Ready');
    requireCheck(ready, 'actorSelected', failures, 'Ready');
    requireCheck(ready, 'clipSelected', failures, 'Ready');
    requireCheck(ready, 'realWeaponVisible', failures, 'Ready');
    requireCheck(ready, 'hiltAwayFromRawHand', failures, 'Ready');
    requireCheck(ready, 'handLocalGripOffsetVisible', failures, 'Ready');
    requireCheck(ready, 'readyHandOrientationSane', failures, 'Ready');
    requireCheck(ready, 'readyBladeNotPointingDownThroughBody', failures, 'Ready');
    requireCheck(ready, 'tipMoves', failures, 'Ready');
    requireCheck(ready, 'tipTracksHand', failures, 'Ready');
    requireCheck(ready, 'socketForwardBladeAxisSane', failures, 'Ready');
    requireCheck(ready, 'reviewClipInventoryVisible', failures, 'Ready');
    requireCheck(ready, 'bodyPoseLandmarksPresent', failures, 'Ready');
    requireCheck(ready, 'readyVisualRelationshipAccepted', failures, 'Ready');
    requireCheck(ready, 'visibleUiTruthAccepted', failures, 'Ready');
    checkCaptureFiles(args.evidence, ready, ['screenshot', 'relationshipCloseup', 'contactSheet'], failures);
  }
}

const report = {
  schema: 'pose-lab-visual-truth-preflight-v1',
  ok: failures.length === 0,
  status: failures.some((failure) => failure.includes('AUTHORITY_REVOKED_FALSE_GREEN')) ? 'AUTHORITY_REVOKED_FALSE_GREEN' : (failures.length ? 'red' : 'green'),
  evidence: path.relative(projectRoot, args.evidence),
  currentCommit: localCommit,
  evidenceCommit: evidence?.commit || '',
  evidenceHeadCommit: evidence?.headCommit || '',
  workflowRunId: evidence?.workflowRunId || evidence?.workflow?.runId || '',
  cacheToken: evidence?.cacheToken || '',
  runtimeBuild: evidence?.runtimeBuild || '',
  wakeUrl: capture(evidence, 'ready')?.url || '',
  failures,
  rule: 'Red screenshot -> fix lying evidence/UI gate -> then edit FK/pose math. Browser wake, green language, promotion, and FK/offset/pose edits are blocked until this preflight is green.',
  allowedNextAction: failures.some((failure) => failure.includes('AUTHORITY_REVOKED_FALSE_GREEN'))
    ? 'Document and repair/quarantine the false-green evidence gate; do not edit FK, offsets, clips, or pose math.'
    : '',
};

if (args.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`visual truth preflight: ${report.ok ? 'green' : 'red'}`);
  console.log(`evidence: ${report.evidence}`);
  console.log(`currentCommit: ${report.currentCommit || 'missing'}`);
  console.log(`evidenceCommit: ${report.evidenceCommit || 'missing'}`);
  if (report.wakeUrl) console.log(`wakeUrl: ${report.wakeUrl}`);
  for (const failure of failures) console.log(`- ${failure}`);
}

if (failures.length) process.exitCode = 1;
