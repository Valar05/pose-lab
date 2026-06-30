import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const projectRoot = path.resolve(import.meta.dirname, '..');
export const baselinePath = path.join(projectRoot, 'generated', 'workflow_state', 'meshy_fps_accepted_baseline.json');
export const latestEvidencePath = path.join(projectRoot, 'generated', 'visual_red_build', 'pose_lab_latest.json');

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
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch (_err) {
    return '';
  }
}

export function gitStatusLines() {
  try {
    return execFileSync('git', ['status', '--short'], { cwd: projectRoot, encoding: 'utf8' })
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
  if (evidence.cacheToken !== cacheToken) errors.push(`evidence cacheToken ${evidence.cacheToken || 'missing'} != current ${cacheToken || 'missing'}`);
  if (evidence.runtimeBuild !== runtimeBuild) errors.push(`evidence runtimeBuild ${evidence.runtimeBuild || 'missing'} != current ${runtimeBuild || 'missing'}`);
  if (evidence.liveVisualQa?.status === 'blocked' || evidence.captureKind === 'visual-qa-blocked') errors.push('evidence is blocked');
  if (evidence.motionEvidencePending === true) errors.push('motion evidence is pending');
  return {
    exists: true,
    path: file,
    evidence,
    stale: evidence.cacheToken !== cacheToken || evidence.runtimeBuild !== runtimeBuild,
    blocked: evidence.liveVisualQa?.status === 'blocked' || evidence.captureKind === 'visual-qa-blocked',
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

  if (evidence.schema !== 'pose-lab-visual-evidence-v1') errors.push(`visual evidence schema ${evidence.schema || 'missing'} is not pose-lab-visual-evidence-v1`);
  if (evidence.cacheToken !== cacheToken) errors.push(`visual evidence cacheToken ${evidence.cacheToken || 'missing'} does not match ${cacheToken || 'missing'}`);
  if (evidence.runtimeBuild !== runtimeBuild) errors.push(`visual evidence runtimeBuild ${evidence.runtimeBuild || 'missing'} does not match ${runtimeBuild || 'missing'}`);
  if (evidence.actorKey !== baseline.actorKey) errors.push(`visual evidence actor ${evidence.actorKey || 'missing'} does not match ${baseline.actorKey}`);
  if (!String(evidence.clipName || '').includes(clipName) && !String(clipName).includes(String(evidence.clipName || '___missing___'))) {
    errors.push(`visual evidence clip ${evidence.clipName || 'missing'} does not match candidate ${clipName}`);
  }
  if (evidence.liveVisualQa?.status === 'blocked' || evidence.captureKind === 'visual-qa-blocked') errors.push('visual evidence is blocked');
  if (evidence.motionEvidencePending === true) errors.push('visual evidence still has motionEvidencePending=true');
  if (!evidence.visualRead || String(evidence.visualRead).length < 20) errors.push('visual evidence needs a concrete visualRead');
  if (!evidence.capturePath) {
    errors.push('visual evidence capturePath is required');
  } else {
    const capturePath = path.isAbsolute(evidence.capturePath) ? evidence.capturePath : path.join(projectRoot, evidence.capturePath);
    if (!fs.existsSync(capturePath)) errors.push(`visual evidence capturePath does not exist: ${evidence.capturePath}`);
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
  if (candidate.weaponIncluded || metrics.weaponIncluded) {
    for (const key of ['saberGripAtHandCenter', 'basketHiltFacesAwayFromBody', 'bladeLongAxisSane']) {
      if (assertions[key] !== true) errors.push(`weapon metric assertion must be true: ${key}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function relative(file) {
  return path.relative(projectRoot, file);
}
