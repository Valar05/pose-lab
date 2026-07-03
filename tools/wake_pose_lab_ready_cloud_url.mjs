#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const defaultEvidencePath = path.join(projectRoot, 'generated', 'firebase_visual_truth', 'latest', 'visual_truth.json');
const androidWakeScript = '/storage/emulated/0/Documents/GodotProjects/.codex/skills/android-chrome-tab-prune/scripts/prune_and_wake_browser.sh';

function usage() {
  return [
    'Usage: node tools/wake_pose_lab_ready_cloud_url.mjs [--evidence PATH] [--dry-run]',
    '',
    'Reads Firebase visual truth evidence and wakes Android Chrome to captures[id="ready"].url.',
    'Refuses red or non-ready artifacts by default; browser wake is for ready-for-review handoff only.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { evidence: defaultEvidencePath, dryRun: false, help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--evidence') args.evidence = path.resolve(projectRoot, String(argv[++i] || ''));
    else if (arg.startsWith('--evidence=')) args.evidence = path.resolve(projectRoot, arg.slice('--evidence='.length));
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function requireReadyEvidence(evidence) {
  const ready = evidence?.captures?.find((capture) => capture.id === 'ready');
  const failures = [];
  if (evidence?.ok !== true) failures.push('visual_truth.ok is not true');
  if (evidence?.truthLedger?.readyBoringFk !== true) failures.push('truthLedger.readyBoringFk is not true');
  if (ready?.accepted !== true) failures.push('ready capture is not accepted');
  if (ready?.evaluation?.checks?.readyVisualRelationshipAccepted !== true) failures.push('ready visual relationship is not accepted');
  if (!ready?.url || ready.url === evidence?.hostedUrl || !ready.url.includes('/pose-lab.html?')) {
    failures.push('missing exact Ready capture URL');
  }
  if (failures.length) throw new Error(`refusing browser wake for non-ready artifact: ${failures.join('; ')}`);
  return ready.url;
}

function runPreflight(evidencePath) {
  const result = spawnSync('node', ['tools/pose_lab_visual_truth_preflight.mjs', '--evidence', evidencePath, '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const detail = String(result.stdout || '').trim();
  if (detail) {
    try {
      return JSON.parse(detail);
    } catch (_error) {
      return { ok: false, failures: [detail] };
    }
  }
  return { ok: result.status === 0, failures: [String(result.stderr || 'visual truth preflight failed').trim()] };
}

const args = parseArgs(process.argv);
if (args.help) {
  console.log(usage());
  process.exit(0);
}

const preflight = runPreflight(args.evidence);
if (preflight.ok !== true) {
  console.log(JSON.stringify({
    schema: 'pose-lab-ready-cloud-url-wake-v1',
    evidence: path.relative(projectRoot, args.evidence),
    dryRun: args.dryRun,
    status: preflight.status === 'AUTHORITY_REVOKED_FALSE_GREEN' ? 'AUTHORITY_REVOKED_FALSE_GREEN' : 'refused',
    reason: preflight.status === 'AUTHORITY_REVOKED_FALSE_GREEN'
      ? 'AUTHORITY_REVOKED_FALSE_GREEN: browser wake blocked because human visual evidence revoked generated proof authority'
      : 'visual truth preflight is red',
    preflight,
    rule: 'URL opened is not visual acceptance; human phone-visible review can still veto.',
  }, null, 2));
  process.exit(1);
}
const evidence = JSON.parse(fs.readFileSync(args.evidence, 'utf8'));
const readyUrl = requireReadyEvidence(evidence);
const report = {
  schema: 'pose-lab-ready-cloud-url-wake-v1',
  evidence: path.relative(projectRoot, args.evidence),
  cacheToken: evidence.cacheToken || '',
  commit: evidence.commit || '',
  readyUrl,
  preflight,
  dryRun: args.dryRun,
  rule: 'URL opened is not visual acceptance; human phone-visible review can still veto.',
};

if (args.dryRun) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

if (!fs.existsSync(androidWakeScript)) throw new Error(`missing Android browser wake script: ${androidWakeScript}`);
const result = spawnSync('sh', [androidWakeScript, '--url', readyUrl], {
  cwd: projectRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
report.stdout = result.stdout.trim();
report.stderr = result.stderr.trim();
report.status = result.status;
if (result.status !== 0) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(result.status || 1);
}
console.log(JSON.stringify(report, null, 2));
