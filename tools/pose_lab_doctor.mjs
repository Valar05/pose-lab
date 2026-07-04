#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  return { json: argv.includes('--json') };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, file), 'utf8'));
  } catch (error) {
    return { __error: error.message };
  }
}

function run(command, args = []) {
  const result = spawnSync(command, args, { cwd: projectRoot, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    exitCode: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function caseReport() {
  const list = JSON.parse(execFileSync('node', ['tools/pose_lab_case.mjs', 'list', '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }));
  const verdicts = list.cases.map((item) => {
    const file = `generated/cases/${item.id}/latest/case_verdict.json`;
    const verdict = readJson(file);
    return {
      id: item.id,
      family: item.family,
      priority: item.priority,
      title: item.title,
      verdict: verdict.__error ? 'missing' : verdict.verdict,
      failedChecks: verdict.__error ? [] : (verdict.checks || []).filter((check) => check.status === 'failed').map((check) => check.id),
      path: file,
    };
  });
  return {
    total: list.cases.length,
    red: verdicts.filter((item) => item.verdict === 'red').map((item) => item.id),
    yellow: verdicts.filter((item) => item.verdict === 'yellow').map((item) => item.id),
    green: verdicts.filter((item) => item.verdict === 'green').map((item) => item.id),
    missing: verdicts.filter((item) => item.verdict === 'missing').map((item) => item.id),
    verdicts,
  };
}

function manifestReport() {
  const manifest = readJson('generated/artifact_manifest.json');
  if (manifest.__error) return { ok: false, error: manifest.__error };
  const deleteEntries = (manifest.entries || []).filter((entry) => entry.retention === 'delete');
  return {
    ok: true,
    summary: manifest.summary || {},
    deleteEntries: deleteEntries.length,
    deletePaths: deleteEntries.slice(0, 10).map((entry) => entry.path),
  };
}

function visualEvidenceReport() {
  const visual = readJson('generated/cases/visual-truth-parity/latest/case_verdict.json');
  if (visual.__error) return { status: 'missing', failedChecks: [] };
  const failedChecks = (visual.checks || []).filter((check) => check.status === 'failed');
  const cacheTokenFailure = failedChecks.find((check) => /cacheToken|visual evidence cacheToken|missing fresh visual evidence/i.test(`${check.stderrTail || ''} ${check.stdoutTail || ''}`));
  return {
    status: visual.verdict,
    failedChecks: failedChecks.map((check) => check.id),
    staleCacheEvidence: Boolean(cacheTokenFailure),
    routeUrl: visual.routeUrl,
    path: 'generated/cases/visual-truth-parity/latest/case_verdict.json',
  };
}

function saberParityReport() {
  const evidence = readJson('generated/visual_red_build/pose_lab_latest.json');
  const caseVerdict = readJson('generated/cases/meshy-saber-live-in-hand/latest/case_verdict.json');
  if (evidence.__error && caseVerdict.__error) {
    return {
      status: 'missing',
      classification: 'missing',
      failedChecks: [],
      nextCommand: 'node tools/refresh_pose_lab_offline_visual_evidence.mjs',
    };
  }
  const failedChecks = caseVerdict.__error
    ? []
    : (caseVerdict.checks || []).filter((check) => check.status === 'failed').map((check) => check.id);
  const assertions = evidence.visualAssertions || {};
  const classification = evidence.captureKind === 'offline-pose-render' && failedChecks.length === 0
    ? 'offline-visual-green'
    : 'offline-visual-red-or-stale';
  const nextCommand = classification === 'offline-visual-green'
    ? 'node tools/pose_lab_case.mjs verify --case meshy-saber-live-in-hand --run-checks --json'
    : 'node tools/refresh_pose_lab_offline_visual_evidence.mjs';
  return {
    status: classification === 'offline-visual-green' ? 'green' : 'red',
    classification,
    failedChecks,
    cacheToken: evidence.cacheToken || '',
    liveCacheToken: '',
    screenshotPath: '',
    assertions,
    path: 'generated/visual_red_build/pose_lab_latest.json',
    nextCommand,
  };
}

function serverReport() {
  const tmux = run('tmux', ['list-sessions']);
  const curl = run('curl', ['-I', '--max-time', '5', 'http://127.0.0.1:8798/pose-lab/pose-lab.html']);
  return {
    tmuxOk: tmux.ok && tmux.stdout.includes('pose-lab-server-8798'),
    httpOk: curl.ok && /HTTP\/1\.[01] 200/.test(curl.stdout),
    noCache: /Cache-Control:.*no-cache|Cache-Control:.*no-store/i.test(curl.stdout),
    tmuxTail: tmux.stdout.split(/\r?\n/).slice(0, 5),
  };
}

function nextCommand(report) {
  if (!report.caseValidation.ok) return 'node tools/pose_lab_case.mjs validate --all';
  if (!report.server.httpOk || !report.server.noCache) return 'node tools/test_no_cache_server_contract.mjs';
  if (report.saberParity.status === 'red') return report.saberParity.nextCommand;
  if (report.visualEvidence.staleCacheEvidence) return 'follow docs/VISUAL_EVIDENCE_REFRESH.md to refresh visual evidence for visual-truth-parity';
  if (report.manifest.deleteEntries > 0) return 'node tools/review_generated_artifact_manifest.mjs --dry-run --delete-marked';
  return 'node tools/pose_lab_case.mjs verify --case generated-churn --json';
}

function buildReport() {
  const validation = JSON.parse(execFileSync('node', ['tools/pose_lab_case.mjs', 'validate', '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }));
  const report = {
    schema: 'pose-lab-doctor-v1',
    generatedAt: new Date().toISOString(),
    caseValidation: validation,
    cases: caseReport(),
    manifest: manifestReport(),
    visualEvidence: visualEvidenceReport(),
    saberParity: saberParityReport(),
    server: serverReport(),
  };
  report.nextCommand = nextCommand(report);
  report.workflowOk = report.caseValidation.ok && report.manifest.ok && report.manifest.deleteEntries === 0 && report.server.httpOk && report.server.noCache;
  return report;
}

function renderText(report) {
  const lines = [];
  lines.push(`workflow: ${report.workflowOk ? 'ok' : 'needs-attention'}`);
  lines.push(`cases: ${report.cases.total} total, red=${report.cases.red.length}, yellow=${report.cases.yellow.length}, missing=${report.cases.missing.length}`);
  if (report.cases.red.length) lines.push(`red cases: ${report.cases.red.join(', ')}`);
  lines.push(`manifest: delete=${report.manifest.deleteEntries}, keep=${report.manifest.summary?.keep?.count ?? '?'}, review=${report.manifest.summary?.review?.count ?? '?'}`);
  lines.push(`visual evidence: ${report.visualEvidence.status}${report.visualEvidence.staleCacheEvidence ? ' (stale cache evidence)' : ''}`);
  lines.push(`saber parity: ${report.saberParity.status} (${report.saberParity.classification})`);
  lines.push(`server: http=${report.server.httpOk ? 'ok' : 'bad'}, no-cache=${report.server.noCache ? 'ok' : 'bad'}, tmux=${report.server.tmuxOk ? 'ok' : 'bad'}`);
  lines.push(`next: ${report.nextCommand}`);
  return `${lines.join('\n')}\n`;
}

const args = parseArgs(process.argv);
const report = buildReport();
if (args.json) console.log(JSON.stringify(report, null, 2));
else console.log(renderText(report));

if (!report.caseValidation.ok || !report.manifest.ok || report.manifest.deleteEntries > 0 || !report.server.httpOk || !report.server.noCache) {
  process.exitCode = 1;
}
