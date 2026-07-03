#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoFullName = 'Valar05/pose-lab';
const workflowName = 'Firebase Visual Truth';
const outRoot = path.join(projectRoot, 'generated', 'cloud_visual_truth_self_service', 'latest');
const canonicalArtifactDir = path.join(projectRoot, 'generated', 'firebase_visual_truth', 'latest');
const androidWakeScript = '/storage/emulated/0/Documents/GodotProjects/.codex/skills/android-chrome-tab-prune/scripts/prune_and_wake_browser.sh';

function parseArgs(argv) {
  const args = {
    push: false,
    wait: false,
    download: false,
    inspect: false,
    timeoutMs: 20 * 60 * 1000,
    pollMs: 15000,
    runId: '',
    commitMessage: '',
    include: [],
    json: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--push') args.push = true;
    else if (arg === '--wait') args.wait = true;
    else if (arg === '--download') args.download = true;
    else if (arg === '--inspect') args.inspect = true;
    else if (arg === '--commit-message') args.commitMessage = String(argv[++i] || '');
    else if (arg.startsWith('--commit-message=')) args.commitMessage = arg.slice('--commit-message='.length);
    else if (arg === '--include') args.include.push(String(argv[++i] || ''));
    else if (arg.startsWith('--include=')) args.include.push(arg.slice('--include='.length));
    else if (arg === '--run-id') args.runId = String(argv[++i] || '');
    else if (arg.startsWith('--run-id=')) args.runId = arg.slice('--run-id='.length);
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++i] || args.timeoutMs);
    else if (arg.startsWith('--timeout-ms=')) args.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    else if (arg === '--poll-ms') args.pollMs = Number(argv[++i] || args.pollMs);
    else if (arg.startsWith('--poll-ms=')) args.pollMs = Number(arg.slice('--poll-ms='.length));
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    'Usage: node tools/pose_lab_cloud_visual_truth_self_service.mjs [--commit-message MSG] [--push] [--wait] [--download] [--inspect]',
    '',
    'Default mode runs local preflight and writes a self-service ledger.',
    '--push pushes the current branch so the PR-triggered Firebase workflow runs.',
    '--commit-message stages tracked edits with git add -u and commits them before push.',
    '--include PATH adds an explicit new file/path before commit; repeat as needed.',
    '--wait polls GitHub for the workflow run for HEAD.',
    '--download downloads the firebase-visual-truth artifact when a run id is known.',
    '--inspect validates the downloaded artifact and prints the PNGs to inspect.',
    '',
    'This tool does not use gh workflow dispatch.',
  ].join('\n');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(`${command} ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
  return String(result.stdout || '').trim();
}

function git(args) {
  return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim();
}

function statusPorcelain() {
  return git(['status', '--porcelain']);
}

function ensureSafeInclude(relPath) {
  const value = String(relPath || '').trim();
  if (!value) throw new Error('empty --include path');
  const full = path.resolve(projectRoot, value);
  if (!full.startsWith(projectRoot + path.sep) && full !== projectRoot) throw new Error(`refusing include outside project root: ${value}`);
  return path.relative(projectRoot, full);
}

function commitTrackedEdits(message, includePaths = []) {
  const cleanBefore = statusPorcelain();
  if (!cleanBefore) return { skipped: 'working tree clean before commit', before: cleanBefore, after: cleanBefore };
  run('git', ['add', '-u']);
  for (const includePath of includePaths.map(ensureSafeInclude)) run('git', ['add', includePath]);
  const staged = git(['diff', '--cached', '--name-only']);
  if (!staged) return { skipped: 'no staged changes after git add -u / --include', before: cleanBefore, after: statusPorcelain() };
  run('git', ['commit', '-m', message]);
  return {
    message,
    staged: staged.split(/\r?\n/).filter(Boolean),
    before: cleanBefore,
    after: statusPorcelain(),
    commit: git(['rev-parse', 'HEAD']),
  };
}

function currentCacheToken() {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
  return source.match(/const\s+LAB_CACHE_TOKEN\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'pose-lab-cloud-visual-truth-self-service',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function githubJson(url) {
  const response = await fetch(url, { headers: githubHeaders(), redirect: 'follow' });
  if (!response.ok) throw new Error(`GitHub API ${response.status} ${response.statusText}: ${url}`);
  return await response.json();
}

async function workflowRunsForCommit(commit) {
  const url = `https://api.github.com/repos/${repoFullName}/actions/runs?head_sha=${encodeURIComponent(commit)}&per_page=20`;
  const json = await githubJson(url);
  return (json.workflow_runs || []).filter((run) => run.name === workflowName);
}

async function waitForRun(commit, timeoutMs, pollMs) {
  const started = Date.now();
  let latest = null;
  while (Date.now() - started < timeoutMs) {
    const runs = await workflowRunsForCommit(commit);
    if (runs.length) {
      latest = runs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      if (latest.status === 'completed') return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`timed out waiting for ${workflowName} for commit ${commit}${latest ? `; latest status=${latest.status}` : ''}`);
}

async function artifactForRun(runId) {
  const url = `https://api.github.com/repos/${repoFullName}/actions/runs/${runId}/artifacts?name=firebase-visual-truth`;
  const json = await githubJson(url);
  const artifact = (json.artifacts || []).find((entry) => entry.name === 'firebase-visual-truth' && entry.expired !== true);
  if (!artifact) throw new Error(`missing firebase-visual-truth artifact for run ${runId}`);
  return artifact;
}

async function downloadArtifact(runId) {
  const artifact = await artifactForRun(runId);
  const downloadUrl = artifact.archive_download_url;
  const response = await fetch(downloadUrl, { headers: githubHeaders(), redirect: 'follow' });
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  const artifactDir = path.join(outRoot, 'artifact');
  fs.mkdirSync(artifactDir, { recursive: true });
  const zipPath = path.join(outRoot, 'firebase-visual-truth.zip');
  if (response.ok) {
    fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
    run('unzip', ['-o', zipPath, '-d', artifactDir]);
    return { artifact, zipPath, artifactDir, downloadMethod: 'github-rest' };
  }

  if (response.status === 401 || response.status === 403) {
    run('gh', ['run', 'download', String(runId), '--repo', repoFullName, '--name', 'firebase-visual-truth', '--dir', artifactDir]);
    return { artifact, zipPath: '', artifactDir, downloadMethod: 'gh-run-download' };
  }

  throw new Error(`artifact download failed ${response.status} ${response.statusText}`);
}

function syncCanonicalArtifact(artifactDir) {
  for (const name of ['visual_truth.json', 'landing.png', 'tpose.png', 'tpose_relationship_closeup.png', 'ready.png', 'ready_relationship_closeup.png', 'ready_visual_follow.png']) {
    const source = path.join(artifactDir, name);
    if (fs.existsSync(source)) {
      fs.mkdirSync(canonicalArtifactDir, { recursive: true });
      fs.copyFileSync(source, path.join(canonicalArtifactDir, name));
    }
  }
  return canonicalArtifactDir;
}

function captureUrl(evidence, id) {
  return evidence?.captures?.find((capture) => capture.id === id)?.url || '';
}

function reviewWakeUrl(evidence) {
  return captureUrl(evidence, 'ready') || captureUrl(evidence, 'tpose') || captureUrl(evidence, 'landing') || '';
}

function runVisualTruthPreflight(artifactDir) {
  const evidencePath = path.join(artifactDir, 'visual_truth.json');
  const result = spawnSync('node', ['tools/pose_lab_visual_truth_preflight.mjs', '--evidence', evidencePath, '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let report = null;
  const detail = String(result.stdout || '').trim();
  if (detail) {
    try {
      report = JSON.parse(detail);
    } catch (_error) {
      report = { ok: false, failures: [detail] };
    }
  } else {
    report = { ok: result.status === 0, failures: [String(result.stderr || 'visual truth preflight failed').trim()] };
  }
  return { ok: result.status === 0 && report?.ok === true, report };
}

function readArtifactEvidence(artifactDir) {
  const file = path.join(artifactDir, 'visual_truth.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseKeyValueReport(text) {
  const parsed = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index > 0) parsed[line.slice(0, index)] = line.slice(index + 1);
  }
  return parsed;
}

function wakeReviewUrl(artifactDir, preflightReport = null) {
  const evidence = readArtifactEvidence(artifactDir);
  const targetUrl = reviewWakeUrl(evidence);
  if (!targetUrl) return { ok: false, targetUrl: '', preflight: preflightReport, skipped: 'missing capture URL in visual_truth.json' };
  if (evidence?.hostedUrl && targetUrl === evidence.hostedUrl) {
    return { ok: false, targetUrl, preflight: preflightReport, skipped: 'refusing to wake base hostedUrl; expected a capture URL with route query parameters' };
  }
  if (!fs.existsSync(androidWakeScript)) return { ok: false, targetUrl, preflight: preflightReport, skipped: `missing Android browser wake script: ${androidWakeScript}` };
  const stdout = run('sh', [androidWakeScript, '--url', targetUrl], { capture: true });
  const summary = parseKeyValueReport(stdout);
  return {
    ok: summary.open_status === 'opened',
    targetUrl,
    preflight: preflightReport,
    report: summary.report || '',
    openStatus: summary.open_status || '',
    pruneStatus: summary.prune_status || '',
    confirmedCloseTaps: summary.confirmed_close_taps || '',
    forceStartCount: summary.force_start_count || '',
    forceStopAttempts: summary.force_stop_attempts || '',
    forceStopCount: summary.force_stop_count || '',
  };
}

function localPreflight(options = {}) {
  const commands = [
    ['node', ['--check', 'src/pose-lab.js']],
    ['node', ['--check', 'src/rig-profiles.js']],
    ['node', ['--check', 'tools/capture_firebase_visual_truth.mjs']],
    ['node', ['tools/test_firebase_hosting_config.mjs']],
    ['node', ['tools/test_pose_lab_no_bad_promotions.mjs']],
    ['git', ['diff', '--check']],
  ];
  if (!options.refreshingFirebaseEvidence) {
    commands.splice(6, 0, ['node', ['tools/test_pose_lab_visual_red_build_contract.mjs']]);
  }
  for (const [command, args] of commands) run(command, args);
  return commands.map(([command, args]) => `${command} ${args.join(' ')}`);
}

const args = parseArgs(process.argv);
if (args.help) {
  console.log(usage());
  process.exit(0);
}

fs.mkdirSync(outRoot, { recursive: true });
const report = {
  schema: 'pose-lab-cloud-visual-truth-self-service-v1',
  generatedAt: new Date().toISOString(),
  branch: git(['branch', '--show-current']),
  commit: git(['rev-parse', 'HEAD']),
  cacheToken: currentCacheToken(),
  repo: repoFullName,
  workflow: workflowName,
  mode: { push: args.push, wait: args.wait, download: args.download, inspect: args.inspect },
  commitStep: null,
  preflight: [],
  run: null,
  artifact: null,
  canonicalArtifactDir: '',
  inspect: null,
  visualTruthPreflight: null,
  browserWake: null,
  next: [],
};

report.preflight = localPreflight({ refreshingFirebaseEvidence: args.download || args.inspect });

if (args.commitMessage) {
  report.commitStep = commitTrackedEdits(args.commitMessage, args.include);
  report.commit = git(['rev-parse', 'HEAD']);
}

if (args.push) {
  run('git', ['push']);
  report.pushed = true;
}

if (args.wait) {
  const runInfo = await waitForRun(report.commit, args.timeoutMs, args.pollMs);
    report.run = {
      id: runInfo.id,
      status: runInfo.status,
      conclusion: runInfo.conclusion,
      htmlUrl: runInfo.html_url,
      headSha: runInfo.head_sha,
    };
    if (runInfo.conclusion && runInfo.conclusion !== 'success') {
      if (!args.download) throw new Error(`Firebase visual truth workflow concluded ${runInfo.conclusion}: ${runInfo.html_url}`);
      report.next.push(`Firebase visual truth workflow concluded ${runInfo.conclusion}; downloading artifact for visual inspection: ${runInfo.html_url}`);
    }
  }

const runId = args.runId || report.run?.id || '';
if (args.download) {
  if (!runId) throw new Error('download requested but no run id is known; use --wait or --run-id');
  const downloaded = await downloadArtifact(runId);
  report.artifact = {
    id: downloaded.artifact.id,
    name: downloaded.artifact.name,
    size: downloaded.artifact.size_in_bytes,
    zipPath: downloaded.zipPath,
    artifactDir: downloaded.artifactDir,
    downloadMethod: downloaded.downloadMethod,
  };
  report.canonicalArtifactDir = syncCanonicalArtifact(downloaded.artifactDir);
}

if (args.inspect) {
  const artifactDir = report.artifact?.artifactDir || path.join(outRoot, 'artifact');
  const inspectText = run('node', ['tools/inspect_firebase_visual_artifact.mjs', '--artifact-dir', artifactDir, '--json'], { capture: true });
  const inspection = JSON.parse(inspectText);
  report.inspect = { artifactDir, ...inspection };
  report.visualTruthPreflight = runVisualTruthPreflight(artifactDir);
  if (inspection.evidenceOk === true && report.visualTruthPreflight.ok === true) {
    report.browserWake = wakeReviewUrl(artifactDir, report.visualTruthPreflight.report);
    if (report.browserWake.ok !== true) throw new Error(`browser wake failed: ${JSON.stringify(report.browserWake)}`);
  } else {
    report.browserWake = {
      ok: false,
      status: report.visualTruthPreflight.report?.status === 'AUTHORITY_REVOKED_FALSE_GREEN' ? 'AUTHORITY_REVOKED_FALSE_GREEN' : 'skipped',
      skipped: report.visualTruthPreflight.ok === true
        ? 'artifact is not ready for browser review; inspect PNGs/debug output without waking Android browser'
        : report.visualTruthPreflight.report?.status === 'AUTHORITY_REVOKED_FALSE_GREEN'
          ? 'AUTHORITY_REVOKED_FALSE_GREEN: browser wake blocked because human visual evidence revoked generated proof authority'
        : 'visual truth preflight is red; browser wake blocked until the evidence/UI gate is honest',
      evidenceOk: inspection.evidenceOk === true,
      preflightOk: report.visualTruthPreflight.ok === true,
      preflight: report.visualTruthPreflight.report,
      targetUrl: inspection.wakeUrl || '',
    };
    report.next.push('Browser wake skipped because the artifact is not green/ready under visual truth preflight; wake only after a reviewable artifact exists.');
  }
}

if (!args.push) report.next.push('Run with --push after committing to trigger the PR Firebase workflow.');
if (!args.wait) report.next.push('Run with --wait to poll the PR-triggered Firebase workflow for HEAD.');
if (!args.download) report.next.push('Run with --download after --wait or --run-id to fetch the firebase-visual-truth artifact.');
if (!args.inspect) report.next.push('Run with --inspect to print the cloud PNG paths that must be visually inspected.');

fs.writeFileSync(path.join(outRoot, 'self_service_report.json'), `${JSON.stringify(report, null, 2)}\n`);
if (args.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`self-service report: ${path.relative(projectRoot, path.join(outRoot, 'self_service_report.json'))}`);
  if (report.run) console.log(`run: ${report.run.id} ${report.run.status} ${report.run.conclusion || ''}`);
  if (report.artifact) console.log(`artifact: ${report.artifact.artifactDir}`);
  if (report.browserWake) console.log(`browserWake: ${report.browserWake.openStatus || 'not-opened'} ${report.browserWake.targetUrl}`);
  for (const next of report.next) console.log(`next: ${next}`);
}
