#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { json: false, mockDir: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--mock-dir') args.mockDir = String(argv[++i] || '');
    else if (arg.startsWith('--mock-dir=')) args.mockDir = arg.slice('--mock-dir='.length);
  }
  return args;
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_err) {
    return fallback;
  }
}

function readText(file, fallback = '') {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_err) {
    return fallback;
  }
}

function gitValue(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch (_err) {
    return fallback;
  }
}

function currentCacheToken() {
  const source = readText(path.join(projectRoot, 'src', 'pose-lab.js'));
  return source.match(/const\s+LAB_CACHE_TOKEN\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

function currentRuntimeBuild() {
  const source = readText(path.join(projectRoot, 'src', 'pose-lab.js'));
  return source.match(/const\s+LAB_BUILD\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

function sourcePath(mockDir, relativePath) {
  return mockDir ? path.join(mockDir, relativePath) : path.join(projectRoot, relativePath);
}

function artifactStatus(file) {
  const exists = fs.existsSync(file);
  return {
    path: path.relative(projectRoot, file),
    exists,
    data: exists ? readJson(file, null) : null,
  };
}

function artifactChanged(current, previous) {
  if (!current.exists || !previous.exists) return null;
  return JSON.stringify(current.data) !== JSON.stringify(previous.data);
}

function evaluate(args) {
  const mockDir = args.mockDir ? path.resolve(args.mockDir) : '';
  const manifest = artifactStatus(sourcePath(mockDir, 'authoring/meshy_saber/manifest.json'));
  const blenderContract = artifactStatus(sourcePath(mockDir, 'authoring/meshy_saber/exports/meshy_ready_saber_contract.json'));
  const firebase = artifactStatus(sourcePath(mockDir, 'generated/firebase_visual_truth/latest/visual_truth.json'));
  const redBuild = artifactStatus(sourcePath(mockDir, 'generated/visual_red_build/pose_lab_latest.json'));
  const previousRed = artifactStatus(sourcePath(mockDir, 'generated/visual_red_build/pose_lab_previous_red.json'));
  const roles = artifactStatus(sourcePath(mockDir, 'contracts/meshy_saber_evidence_roles.json'));

  const cacheToken = currentCacheToken();
  const runtimeBuild = currentRuntimeBuild();
  const failures = [];
  const warnings = [];

  const blenderApproved = blenderContract.data?.status === 'human-approved' || blenderContract.data?.approval?.humanApproved === true;
  const blenderScaffolded = manifest.data?.status === 'scaffolded-no-approved-export';
  const poseLabImportApproved = blenderContract.data?.poseLabImport?.verified === true;
  const firebaseGreen = firebase.data?.ok === true
    && firebase.data?.truthLedger?.tposeStableIdle === true
    && firebase.data?.truthLedger?.readyBoringFk === true;
  const firebaseFresh = !firebase.exists
    ? false
    : firebase.data?.cacheToken === cacheToken && firebase.data?.runtimeBuild === runtimeBuild;
  const redVeto = redBuild.data?.humanRed === true
    || redBuild.data?.ok === false
    || /red/i.test(String(redBuild.data?.status || ''));
  const noVisibleChange = artifactChanged(redBuild, previousRed) === false;

  if (!manifest.exists) failures.push('missing Blender authoring manifest');
  if (blenderScaffolded && !blenderApproved) failures.push('Blender authoring is scaffolded but no human-approved export exists');
  if (!roles.exists) failures.push('missing Meshy saber evidence role map');
  if (firebase.exists && !firebaseFresh) warnings.push('Firebase artifact is stale for the current cache token/runtime build');
  if (redVeto) failures.push('current red-build evidence vetoes green claims');
  if (noVisibleChange) failures.push('latest red-build artifact matches previous red artifact; no visible improvement proven');
  if (firebaseGreen && !blenderApproved) failures.push('Firebase cannot be accepted before Blender authoring truth is approved');
  if (firebaseGreen && !poseLabImportApproved) failures.push('Firebase cannot be accepted before Pose Lab import truth is verified');

  const authorityStage = blenderApproved
    ? (poseLabImportApproved ? (firebaseGreen ? 'cloud-presentation' : 'pose-lab-import') : 'pose-lab-import')
    : 'blender-authoring';

  const runtimeFixAllowed = blenderApproved && poseLabImportApproved && !redVeto && !noVisibleChange;
  const wakeAllowed = firebaseGreen && firebaseFresh && blenderApproved && poseLabImportApproved && !redVeto && !noVisibleChange;

  return {
    schema: 'pose-lab-recovery-gate-v1',
    branch: gitValue(['branch', '--show-current']),
    commit: gitValue(['rev-parse', '--short', 'HEAD']),
    cacheToken,
    runtimeBuild,
    authorityStage,
    blender: {
      manifest: { exists: manifest.exists, status: manifest.data?.status || '' },
      approved: blenderApproved,
      contractPath: blenderContract.path,
      contractExists: blenderContract.exists,
    },
    poseLabImport: {
      approved: poseLabImportApproved,
      requiredHierarchy: 'RightHand -> WeaponGrip -> sabre mesh',
    },
    firebase: {
      exists: firebase.exists,
      fresh: firebaseFresh,
      green: firebaseGreen,
      hostedUrl: firebase.data?.hostedUrl || '',
    },
    redBuild: {
      exists: redBuild.exists,
      veto: redVeto,
      noVisibleChange,
      path: redBuild.path,
    },
    permissions: {
      runtimeFixAllowed,
      wakeAllowed,
      claimGreenAllowed: wakeAllowed,
    },
    failures,
    warnings,
  };
}

const args = parseArgs(process.argv);
const report = evaluate(args);
if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Pose Lab recovery gate: ${report.authorityStage}`);
  console.log(`runtimeFixAllowed=${report.permissions.runtimeFixAllowed} wakeAllowed=${report.permissions.wakeAllowed} claimGreenAllowed=${report.permissions.claimGreenAllowed}`);
  for (const failure of report.failures) console.log(`FAIL: ${failure}`);
  for (const warning of report.warnings) console.log(`WARN: ${warning}`);
}

