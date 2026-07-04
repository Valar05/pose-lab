#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  return { json: argv.includes('--json') };
}

function rel(file) {
  return path.relative(projectRoot, file);
}

function readJsonMaybe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { __error: error.message };
  }
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch (_error) {
    return '';
  }
}

function currentCacheToken() {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
  return source.match(/const\s+LAB_CACHE_TOKEN\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

function currentRuntimeBuild() {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
  return source.match(/const\s+LAB_BUILD\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

function runPreflight() {
  const result = spawnSync('node', ['tools/pose_lab_visual_truth_preflight.mjs', '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let report = null;
  try {
    report = JSON.parse(result.stdout || '{}');
  } catch (_error) {
    report = null;
  }
  return {
    exitCode: result.status,
    status: report?.status || 'unreadable',
    ok: report?.ok === true,
    evidence: report?.evidence || 'generated/firebase_visual_truth/latest/visual_truth.json',
    wakeUrl: report?.wakeUrl || '',
    failures: Array.isArray(report?.failures) ? report.failures : [],
    allowedNextAction: report?.allowedNextAction || '',
  };
}

function openRedBuilds() {
  const file = path.join(projectRoot, 'evidence', 'human_visual_truth_red_builds.json');
  const payload = readJsonMaybe(file);
  const entries = Array.isArray(payload.redBuilds) ? payload.redBuilds : [];
  return entries.filter((entry) => !(entry.status === 'superseded'
    && entry.humanAccepted === true
    && entry.supersededByCommit
    && entry.acceptedEvidencePath)).map((entry) => ({
    commit: entry.commit || '',
    artifactCommit: entry.artifactCommit || '',
    runId: entry.runId || entry.firebaseRunId || entry.workflowRunId || '',
    authority: entry.authority || '',
    status: entry.status || 'open',
    url: entry.url || entry.hostedUrl || '',
    issues: Array.isArray(entry.issues) ? entry.issues : [],
  }));
}

function evidenceSummary(evidenceRel) {
  const file = path.join(projectRoot, evidenceRel);
  const evidence = readJsonMaybe(file);
  if (evidence.__error) return { path: evidenceRel, present: false, error: evidence.__error };
  return {
    path: evidenceRel,
    present: true,
    ok: evidence.ok === true,
    authority: evidence.authority || '',
    cacheToken: evidence.cacheToken || '',
    runtimeBuild: evidence.runtimeBuild || '',
    commit: evidence.commit || '',
    headCommit: evidence.headCommit || '',
    hostedUrl: evidence.hostedUrl || '',
    senseVerdict: evidence.senseSynthesis?.verdict || '',
    captures: Array.isArray(evidence.captures) ? evidence.captures.map((capture) => ({
      id: capture.id,
      accepted: capture.accepted === true,
      verdict: capture.senseSynthesis?.verdict || '',
      screenshot: capture.screenshot || '',
      relationshipCloseup: capture.relationshipCloseup || '',
      contactSheet: capture.contactSheet || '',
    })) : [],
  };
}

function allowedWork(preflight) {
  if (preflight.status === 'AUTHORITY_REVOKED_FALSE_GREEN') {
    return [
      'document false-green evidence',
      'repair or quarantine lying evidence gates',
      'classify dirty work',
      'audit tests as acceptance/diagnostic/guardrail/quarantine',
    ];
  }
  if (!preflight.ok) {
    return [
      'repair visual evidence lane',
      'refresh or inspect cloud artifacts',
      'do not claim green',
    ];
  }
  return [
    'inspect cloud screenshots',
    'report visible relationship',
    'wake exact Ready capture URL if ready for human review',
  ];
}

function blockedWork(preflight) {
  if (preflight.ok) return [];
  return [
    'green/fixed/accepted language',
    'browser wake',
    'promotion',
    'FK edits',
    'offset edits',
    'pose or clip edits',
  ];
}

function buildReport() {
  const preflight = runPreflight();
  const evidencePath = preflight.evidence || 'generated/firebase_visual_truth/latest/visual_truth.json';
  return {
    schema: 'pose-lab-current-truth-v1',
    generatedAt: new Date().toISOString(),
    branch: git(['branch', '--show-current']),
    commit: git(['rev-parse', 'HEAD']),
    statusShort: git(['status', '--short']),
    cacheToken: currentCacheToken(),
    runtimeBuild: currentRuntimeBuild(),
    preflight,
    openRedBuilds: openRedBuilds(),
    visualEvidence: evidenceSummary(evidencePath),
    allowedWork: allowedWork(preflight),
    blockedWork: blockedWork(preflight),
  };
}

function renderText(report) {
  const lines = [];
  lines.push(`truth: ${report.preflight.status}`);
  lines.push(`branch: ${report.branch}`);
  lines.push(`commit: ${report.commit}`);
  lines.push(`cache: ${report.cacheToken}`);
  lines.push(`runtime: ${report.runtimeBuild}`);
  lines.push(`evidence: ${report.visualEvidence.path} (${report.visualEvidence.present ? report.visualEvidence.authority || 'present' : 'missing'})`);
  lines.push(`open red-build strikes: ${report.openRedBuilds.length}`);
  if (report.preflight.failures.length) {
    lines.push('failures:');
    for (const failure of report.preflight.failures.slice(0, 6)) lines.push(`- ${failure}`);
  }
  lines.push(`allowed: ${report.allowedWork.join('; ') || 'none'}`);
  lines.push(`blocked: ${report.blockedWork.join('; ') || 'none'}`);
  if (report.preflight.allowedNextAction) lines.push(`next: ${report.preflight.allowedNextAction}`);
  return `${lines.join('\n')}\n`;
}

const args = parseArgs(process.argv);
const report = buildReport();
if (args.json) console.log(JSON.stringify(report, null, 2));
else console.log(renderText(report));

if (report.preflight.status === 'unreadable') process.exitCode = 1;
