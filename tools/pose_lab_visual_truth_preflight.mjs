#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const ledgerPath = path.join(projectRoot, 'evidence', 'human_visual_truth_red_builds.json');

function parseArgs(argv) {
  const args = { evidence: '', json: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--evidence') args.evidence = path.resolve(projectRoot, String(argv[++i] || ''));
    else if (arg.startsWith('--evidence=')) args.evidence = path.resolve(projectRoot, arg.slice('--evidence='.length));
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function currentCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch (_error) {
    return '';
  }
}

function readText(relPath) {
  return fs.readFileSync(path.join(projectRoot, relPath), 'utf8');
}

function currentCacheToken() {
  return readText('pose-lab.html').match(/pose-lab\.js\?v=([^'"\s]+)/)?.[1]
    || readText('src/pose-lab.js').match(/const\s+LAB_CACHE_TOKEN\s*=\s*['"]([^'"]+)['"]/)?.[1]
    || '';
}

function currentRuntimeBuild() {
  return readText('src/pose-lab.js').match(/const\s+LAB_BUILD\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

function commitIsAncestorOfHead(commit = '') {
  const value = String(commit || '').trim();
  if (!/^[0-9a-f]{7,40}$/i.test(value)) return false;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', value, 'HEAD'], { cwd: projectRoot, stdio: 'ignore' });
    return true;
  } catch (_error) {
    return false;
  }
}

function closed(entry) {
  return entry?.status === 'superseded'
    && entry?.humanAccepted === true
    && Boolean(entry?.supersededByCommit)
    && Boolean(entry?.acceptedEvidencePath);
}

function activeVeto() {
  if (!fs.existsSync(ledgerPath)) return null;
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  const builds = Array.isArray(ledger.redBuilds) ? ledger.redBuilds : [];
  const head = currentCommit();
  return builds.filter((entry) => !closed(entry)).find((entry) => {
    const ids = [entry.commit, entry.headCommit, entry.artifactCommit].filter(Boolean);
    return ids.includes(head) || ids.some(commitIsAncestorOfHead);
  }) || null;
}

function evidenceFailures(evidencePath) {
  if (!evidencePath) return [];
  if (!fs.existsSync(evidencePath)) return [`evidence file missing: ${path.relative(projectRoot, evidencePath)}`];
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  const failures = [];
  if (evidence.ok !== true) failures.push('visual_truth.ok is not true');
  if (evidence.commit && evidence.commit !== currentCommit()) failures.push(`visual truth commit ${evidence.commit} != current ${currentCommit()}`);
  if (evidence.cacheToken && evidence.cacheToken !== currentCacheToken()) failures.push(`visual truth cacheToken ${evidence.cacheToken} != current ${currentCacheToken()}`);
  if (evidence.runtimeBuild && evidence.runtimeBuild !== currentRuntimeBuild()) failures.push(`visual truth runtimeBuild ${evidence.runtimeBuild} != current ${currentRuntimeBuild()}`);
  if (!Array.isArray(evidence.captures) || !evidence.captures.length) failures.push('visual truth evidence has no captures');
  if (!evidence.hostedUrl && !evidence.captures?.some((capture) => String(capture.url || '').startsWith('https://pose-lab-visual-truth'))) {
    failures.push('visual truth evidence does not point at hosted Firebase Pose Lab');
  }
  return failures;
}

const args = parseArgs(process.argv);
if (args.help) {
  console.log('Usage: node tools/pose_lab_visual_truth_preflight.mjs [--evidence PATH] [--json]');
  process.exit(0);
}

const veto = activeVeto();
const failures = [];
if (veto) {
  const issues = Array.isArray(veto.issues) ? veto.issues : [veto.reason || 'human red build'];
  failures.push(`AUTHORITY_REVOKED_FALSE_GREEN: ${issues.join('; ')}`);
}
failures.push(...evidenceFailures(args.evidence));

const report = failures.length
  ? {
      ok: false,
      status: veto ? 'AUTHORITY_REVOKED_FALSE_GREEN' : 'VISUAL_TRUTH_PREFLIGHT_RED',
      commit: currentCommit(),
      failures,
    }
  : {
      ok: true,
      status: 'VISUAL_TRUTH_PREFLIGHT_OK',
      commit: currentCommit(),
    };

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
