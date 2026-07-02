import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const projectRoot = path.resolve(import.meta.dirname, '..');
export const baselinePath = path.join(projectRoot, 'generated', 'workflow_state', 'meshy_fps_accepted_baseline.json');
export const latestEvidencePath = path.join(projectRoot, 'generated', 'visual_red_build', 'meshy_ready_weapon_fk_follow_latest.json');

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function readText(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

export function currentCacheToken() {
  const html = readText('pose-lab.html');
  const match = html.match(/pose-lab\.js\?v=([^'"\s]+)/);
  return match?.[1] || '';
}

export function currentRuntimeBuild() {
  const runtime = readText('src/pose-lab.js');
  const match = runtime.match(/const\s+LAB_BUILD\s*=\s*['"]([^'"]+)['"]/);
  return match?.[1] || '';
}

export function currentCommit() {
  try {
    return execFileSync('git', ['-c', `safe.directory=${projectRoot}`, 'rev-parse', '--short', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch (_err) {
    return '';
  }
}

export function gitStatusLines() {
  try {
    return execFileSync('git', ['-c', `safe.directory=${projectRoot}`, 'status', '--short'], { cwd: projectRoot, encoding: 'utf8' })
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
  } catch (_err) {
    return [];
  }
}

export function protectedDirtyFiles(lines = gitStatusLines()) {
  const protectedPrefixes = [
    'PROJECT_ORIENTATION.md',
    'docs/ANIMATION_WORKFLOW_TOOLING.md',
    'pose-critique.html',
    'pose-lab.html',
    'src/pose-lab.js',
    'src/rig-profiles.js',
    'generated/workflow_state/',
    'tools/promote_pose_candidate.mjs',
    'tools/pose_lab_workflow_status.mjs',
    'tools/pose_lab_workflow_lib.mjs',
  ];
  return lines.filter((line) => {
    const file = line.replace(/^.. /, '');
    return protectedPrefixes.some((prefix) => file === prefix || file.startsWith(prefix));
  });
}

export function currentMeshySelectionSurfaces() {
  const profiles = readText('src/rig-profiles.js');
  const meshyStart = profiles.indexOf('meshyCharacter:');
  const meshyEnd = profiles.indexOf('\n  meshyStatic:', meshyStart);
  const meshy = profiles.slice(meshyStart, meshyEnd > meshyStart ? meshyEnd : undefined);
  const startupClip = meshy.match(/startupClip:\s*\{\s*name:\s*'([^']+)'/)?.[1] || '';
  const lineFor = (name) => meshy.split(/\r?\n/).find((line) => line.includes(`${name}: [`)) || '';
  const stringValues = (line) => Array.from(line.matchAll(/'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"/g))
    .map((entry) => (entry[1] ?? entry[2] ?? '').replace(/\\\\/g, '\\').replace(/\\'/g, "'").replace(/\\"/g, '"'));
  return {
    startupClip,
    swordReadyAliases: stringValues(lineFor('SwordReady')),
    restProbeAliases: stringValues(lineFor('RestProbe')),
    weaponVisibleClipPatterns: stringValues(lineFor('visibleClipPatterns')),
  };
}

export function compareSelectionSurfaces(baseline, current = currentMeshySelectionSurfaces()) {
  const expected = baseline.selectionSurfaces || {};
  const mismatches = [];
  for (const key of ['startupClip', 'swordReadyAliases', 'restProbeAliases', 'weaponVisibleClipPatterns']) {
    const a = JSON.stringify(expected[key] ?? (Array.isArray(current[key]) ? [] : ''));
    const b = JSON.stringify(current[key] ?? (Array.isArray(expected[key]) ? [] : ''));
    if (a !== b) mismatches.push({ key, expected: expected[key], actual: current[key] });
  }
  return mismatches;
}

export function evidenceCacheToken(evidence) {
  return evidence.cacheToken || evidence.currentFixCacheToken || '';
}

export function evidenceClipName(evidence) {
  return evidence.clipName || evidence.readyClipName || '';
}

export function isParityEvidence(evidence) {
  return evidence?.schema === 'pose-lab-ready-weapon-fk-offline-web-parity-gate-v1';
}

export function isLegacyVisualEvidence(evidence) {
  return evidence?.schema === 'pose-lab-visual-evidence-v1';
}


export function resolveEvidencePath(file) {
  if (!file) return '';
  return path.isAbsolute(file) ? file : path.join(projectRoot, file);
}

function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function readEvidenceJsonForValidation(file, label, errors) {
  const resolved = resolveEvidencePath(file);
  if (!file) {
    errors.push(`parity evidence missing ${label}`);
    return null;
  }
  if (!fs.existsSync(resolved)) {
    errors.push(`parity evidence ${label} does not exist: ${file}`);
    return null;
  }
  try {
    return readJson(resolved);
  } catch (error) {
    errors.push(`parity evidence ${label} is invalid JSON: ${error.message}`);
    return null;
  }
}

export function validateParityEvidenceReadback(evidence) {
  const errors = [];
  if (!isParityEvidence(evidence)) return errors;
  const observed = readEvidenceJsonForValidation(evidence.observedWebTruthPath, 'observedWebTruthPath', errors);
  if (observed && !jsonEqual(observed, evidence.observedWebTruth)) {
    errors.push('parity evidence embedded observedWebTruth does not match observedWebTruthPath file');
  }
  const offlineArtifactPath = evidence.offlineVisualTruth?.artifactPath || '';
  const offline = readEvidenceJsonForValidation(offlineArtifactPath, 'offlineVisualTruth.artifactPath', errors);
  if (offline) {
    for (const key of ['cacheToken', 'runtimeBuild', 'actorKey', 'clipName', 'observedWebTruthPath', 'result']) {
      if (!jsonEqual(offline[key], key === 'result' ? evidence.offlineVisualTruth?.result : evidence[key])) {
        errors.push(`parity evidence offline artifact ${key} does not match wrapper`);
      }
    }
    for (const key of ['observedWebTruth', 'offlineTruth', 'parity']) {
      if (!jsonEqual(offline[key], evidence[key])) errors.push(`parity evidence offline artifact ${key} does not match wrapper`);
    }
    if (!jsonEqual(offline.sheet, evidence.offlineVisualTruth?.sheetPath)) {
      errors.push('parity evidence offline artifact sheet does not match wrapper sheetPath');
    }
  }
  const sheetPath = evidence.offlineVisualTruth?.sheetPath || '';
  const resolvedSheet = resolveEvidencePath(sheetPath);
  if (!sheetPath) {
    errors.push('parity evidence missing offlineVisualTruth.sheetPath');
  } else if (!fs.existsSync(resolvedSheet)) {
    errors.push(`parity evidence sheetPath does not exist: ${sheetPath}`);
  } else if (fs.statSync(resolvedSheet).size <= 0) {
    errors.push(`parity evidence sheetPath is empty: ${sheetPath}`);
  }
  return errors;
}

export function latestEvidenceStatus(file = latestEvidencePath) {
  if (!fs.existsSync(file)) return { exists: false, path: file, stale: true, blocked: true, errors: ['missing visual evidence'] };
  let evidence = null;
  try {
    evidence = readJson(file);
  } catch (error) {
    return { exists: true, path: file, stale: true, blocked: true, errors: [`invalid evidence JSON: ${error.message}`] };
  }
  const cacheToken = currentCacheToken();
  const runtimeBuild = currentRuntimeBuild();
  const errors = [];
  const token = evidenceCacheToken(evidence);
  if (token !== cacheToken) errors.push(`evidence cacheToken ${token || 'missing'} != current ${cacheToken || 'missing'}`);
  if (evidence.runtimeBuild !== runtimeBuild) errors.push(`evidence runtimeBuild ${evidence.runtimeBuild || 'missing'} != current ${runtimeBuild || 'missing'}`);
  if (isParityEvidence(evidence)) {
    if (evidence.browserCaptureDeprecated !== true) errors.push('parity evidence must deprecate browser capture');
    if (evidence.parity?.visualVerdict !== 'fixed') errors.push(`parity evidence is ${evidence.parity?.visualVerdict || 'missing'}, not fixed`);
    errors.push(...validateParityEvidenceReadback(evidence));
  } else if (isLegacyVisualEvidence(evidence)) {
    if (evidence.liveVisualQa?.status === 'blocked' || evidence.captureKind === 'visual-qa-blocked') errors.push('evidence is blocked');
    if (evidence.motionEvidencePending === true) errors.push('motion evidence is pending');
  } else {
    errors.push(`visual evidence schema ${evidence.schema || 'missing'} is unsupported`);
  }
  return {
    exists: true,
    path: file,
    evidence,
    stale: token !== cacheToken || evidence.runtimeBuild !== runtimeBuild,
    blocked: isParityEvidence(evidence) ? evidence.parity?.visualVerdict !== 'fixed' || errors.length > 0 : evidence.liveVisualQa?.status === 'blocked' || evidence.captureKind === 'visual-qa-blocked',
    errors,
  };
}

export function validateCandidatePromotion({ baseline, candidate, evidence, metrics, cacheToken = currentCacheToken(), runtimeBuild = currentRuntimeBuild() }) {
  const errors = [];
  const warnings = [];
  if (!candidate || typeof candidate !== 'object') errors.push('candidate JSON is required');
  if (!evidence || typeof evidence !== 'object') errors.push('visual evidence JSON is required');
  if (!metrics || typeof metrics !== 'object') errors.push('metric evidence JSON is required');
  if (errors.length) return { ok: false, errors, warnings };

  const actorKey = candidate.actorKey || candidate.targetActorKey || baseline.actorKey;
  const clipName = candidate.clipName || candidate.name || candidate.targetClip || '';
  if (actorKey !== baseline.actorKey) errors.push(`candidate actor ${actorKey || 'missing'} does not match protected actor ${baseline.actorKey}`);
  if (!clipName) errors.push('candidate clipName/name/targetClip is required');
  if (candidate.status !== 'candidate-only') warnings.push(`candidate status is ${candidate.status || 'missing'}, expected candidate-only before promotion`);
  if (candidate.promotable === true) warnings.push('candidate was already marked promotable before gate validation');

  const token = evidenceCacheToken(evidence);
  const evidenceClip = evidenceClipName(evidence);
  if (token !== cacheToken) errors.push(`visual evidence cacheToken ${token || 'missing'} does not match ${cacheToken || 'missing'}`);
  if (evidence.runtimeBuild !== runtimeBuild) errors.push(`visual evidence runtimeBuild ${evidence.runtimeBuild || 'missing'} does not match ${runtimeBuild || 'missing'}`);
  if (evidence.actorKey !== baseline.actorKey) errors.push(`visual evidence actor ${evidence.actorKey || 'missing'} does not match ${baseline.actorKey}`);
  if (!String(evidenceClip || '').includes(clipName) && !String(clipName).includes(String(evidenceClip || '___missing___'))) {
    errors.push(`visual evidence clip ${evidenceClip || 'missing'} does not match candidate ${clipName}`);
  }

  if (isParityEvidence(evidence)) {
    if (evidence.browserCaptureDeprecated !== true) errors.push('parity evidence must deprecate browser capture');
    if (evidence.parity?.visualVerdict !== 'fixed') errors.push(`parity evidence visualVerdict ${evidence.parity?.visualVerdict || 'missing'} is not fixed`);
    if (evidence.parity?.parityMatches !== true) errors.push('parity evidence must have parityMatches=true');
    if (evidence.observedWebTruth?.visualClass !== 'sword-follows-fk') errors.push(`observed web truth ${evidence.observedWebTruth?.visualClass || 'missing'} is not sword-follows-fk`);
    if (evidence.offlineTruth?.visualClass !== 'sword-follows-fk') errors.push(`offline truth ${evidence.offlineTruth?.visualClass || 'missing'} is not sword-follows-fk`);
    if (evidence.offlineTruth?.visibilityClass !== 'weapon-visible') errors.push(`offline weapon visibility ${evidence.offlineTruth?.visibilityClass || 'missing'} is not weapon-visible`);
    errors.push(...validateParityEvidenceReadback(evidence));
  } else if (isLegacyVisualEvidence(evidence)) {
    if (evidence.liveVisualQa?.status === 'blocked' || evidence.captureKind === 'visual-qa-blocked') errors.push('visual evidence is blocked');
    if (evidence.motionEvidencePending === true) errors.push('visual evidence still has motionEvidencePending=true');
    if (!evidence.visualRead || String(evidence.visualRead).length < 20) errors.push('visual evidence needs a concrete visualRead');
    if (!evidence.capturePath) {
      errors.push('visual evidence capturePath is required');
    } else {
      const capturePath = path.isAbsolute(evidence.capturePath) ? evidence.capturePath : path.join(projectRoot, evidence.capturePath);
      if (!fs.existsSync(capturePath)) errors.push(`visual evidence capturePath does not exist: ${evidence.capturePath}`);
    }
  } else {
    errors.push(`visual evidence schema ${evidence.schema || 'missing'} is unsupported`);
  }

  if (metrics.schema !== 'pose-lab-promotion-metrics-v1') errors.push(`metric evidence schema ${metrics.schema || 'missing'} is not pose-lab-promotion-metrics-v1`);
  if (metrics.actorKey !== baseline.actorKey) errors.push(`metric actor ${metrics.actorKey || 'missing'} does not match ${baseline.actorKey}`);
  if (!String(metrics.clipName || '').includes(clipName) && !String(clipName).includes(String(metrics.clipName || '___missing___'))) {
    errors.push(`metric clip ${metrics.clipName || 'missing'} does not match candidate ${clipName}`);
  }
  const assertions = metrics.assertions || {};
  for (const key of [
    'beatsOrPreservesBaseline',
    'noTposeLeak',
    'armLengthPreserved',
    'handPositionSane',
    'rollDoesNotMoveJoints',
  ]) {
    if (assertions[key] !== true) errors.push(`metric assertion must be true: ${key}`);
  }
  if (candidate.weaponIncluded || metrics.weaponIncluded || isParityEvidence(evidence)) {
    for (const key of ['saberGripAtHandCenter', 'basketHiltFacesAwayFromBody', 'bladeLongAxisSane']) {
      if (assertions[key] !== true) errors.push(`weapon metric assertion must be true: ${key}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function relative(file) {
  return path.relative(projectRoot, file);
}
