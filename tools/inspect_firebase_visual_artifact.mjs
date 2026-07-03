#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {
    artifactDir: path.join(projectRoot, 'generated', 'firebase_visual_truth', 'latest'),
    requireGreen: false,
    strictCommit: false,
    json: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--artifact-dir') args.artifactDir = path.resolve(String(argv[++i] || ''));
    else if (arg.startsWith('--artifact-dir=')) args.artifactDir = path.resolve(arg.slice('--artifact-dir='.length));
    else if (arg === '--require-green') args.requireGreen = true;
    else if (arg === '--strict-commit') args.strictCommit = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    'Usage: node tools/inspect_firebase_visual_artifact.mjs [--artifact-dir DIR] [--require-green] [--strict-commit] [--json]',
    '',
    'Validates the Firebase visual truth artifact shape and prints the cloud PNGs that must be inspected.',
  ].join('\n');
}

function readText(relPath) {
  return fs.readFileSync(path.join(projectRoot, relPath), 'utf8');
}

function currentCacheToken() {
  return readText('src/pose-lab.js').match(/const\s+LAB_CACHE_TOKEN\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

function currentCommit() {
  try {
    const head = fs.readFileSync(path.join(projectRoot, '.git', 'HEAD'), 'utf8').trim();
    if (head.startsWith('ref: ')) {
      const ref = head.slice('ref: '.length);
      return fs.readFileSync(path.join(projectRoot, '.git', ref), 'utf8').trim();
    }
    return head;
  } catch (_error) {
    return '';
  }
}

function relOrAbs(file) {
  return path.isAbsolute(file) ? file : path.join(projectRoot, file);
}

function requiredFile(dir, name, failures) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) failures.push(`missing Firebase artifact file: ${file}`);
  return file;
}

function commitMatches(current, artifact) {
  if (!current || !artifact) return true;
  return String(current).startsWith(String(artifact)) || String(artifact).startsWith(String(current));
}

const args = parseArgs(process.argv);
if (args.help) {
  console.log(usage());
  process.exit(0);
}

const failures = [];
const warnings = [];
const artifactDir = args.artifactDir;
const visualTruthPath = requiredFile(artifactDir, 'visual_truth.json', failures);
const tposePath = requiredFile(artifactDir, 'tpose.png', failures);
const readyPath = requiredFile(artifactDir, 'ready.png', failures);
const followPath = requiredFile(artifactDir, 'ready_visual_follow.png', failures);

let evidence = null;
if (fs.existsSync(visualTruthPath)) {
  try {
    evidence = JSON.parse(fs.readFileSync(visualTruthPath, 'utf8'));
  } catch (error) {
    failures.push(`invalid visual_truth.json: ${error.message}`);
  }
}

if (evidence) {
  if (evidence.schema !== 'pose-lab-firebase-visual-truth-v1') failures.push(`unexpected artifact schema: ${evidence.schema || 'missing'}`);
  if (evidence.authority !== 'firebase-hosted-cloud-browser') failures.push(`unexpected evidence authority: ${evidence.authority || 'missing'}`);
  if (evidence.cacheToken !== currentCacheToken()) failures.push(`stale cache token: artifact=${evidence.cacheToken || 'missing'} current=${currentCacheToken()}`);
  const commit = currentCommit();
  if (!commitMatches(commit, evidence.commit)) {
    const message = `artifact commit does not match current checkout: artifact=${evidence.commit} current=${commit}`;
    if (args.strictCommit) failures.push(message);
    else warnings.push(`${message}; GitHub pull_request artifacts may use the merge SHA, inspect run metadata before treating this as stale`);
  }
  for (const id of ['landing', 'tpose', 'ready']) {
    if (!evidence.captures?.some((capture) => capture.id === id)) failures.push(`missing ${id} capture in visual_truth.json`);
  }
  const ready = evidence.captures?.find((capture) => capture.id === 'ready');
  if (ready && ready.contactSheet && path.resolve(projectRoot, ready.contactSheet) !== followPath) {
    failures.push(`ready contactSheet points somewhere unexpected: ${ready.contactSheet}`);
  }
  if (args.requireGreen && evidence.ok !== true) failures.push('Firebase visual truth JSON is not green');
}

const report = {
  schema: 'pose-lab-firebase-visual-artifact-inspection-v1',
  artifactDir,
  ok: failures.length === 0,
  requireGreen: args.requireGreen,
  strictCommit: args.strictCommit,
  evidenceOk: evidence?.ok === true,
  hostedUrl: evidence?.hostedUrl || '',
  commit: evidence?.commit || '',
  cacheToken: evidence?.cacheToken || '',
  imagesToInspect: {
    tpose: tposePath,
    ready: readyPath,
    readyVisualFollow: followPath,
  },
  failures,
  warnings,
  visualAuthorityReminder: 'Inspect these PNGs directly before reporting a visual pass. JSON and telemetry are support evidence only.',
};

if (args.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`artifact: ${artifactDir}`);
  console.log(`hostedUrl: ${report.hostedUrl || 'missing'}`);
  console.log(`commit: ${report.commit || 'missing'}`);
  console.log(`cacheToken: ${report.cacheToken || 'missing'}`);
  console.log(`tpose: ${report.imagesToInspect.tpose}`);
  console.log(`ready: ${report.imagesToInspect.ready}`);
  console.log(`readyVisualFollow: ${report.imagesToInspect.readyVisualFollow}`);
  if (failures.length) {
    console.log('failures:');
    for (const failure of failures) console.log(`- ${failure}`);
  }
  if (warnings.length) {
    console.log('warnings:');
    for (const warning of warnings) console.log(`- ${warning}`);
  }
}

if (failures.length) process.exitCode = 1;
