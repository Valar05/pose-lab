#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routeUrl = 'http://127.0.0.1:8798/pose-lab/pose-lab.html?mode=standard&actor=meshyCharacter&clip=OneHandReady+-%3E+meshyCharacter+%5BFPS-VISUAL-IK+R-120+L-90%5D&weaponDebug=1&debugBridge=1&debugBridgeUrl=http%3A%2F%2F127.0.0.1%3A8899&cacheBust=mesh-saber-parity-refresh';

function parseArgs(argv) {
  return {
    open: argv.includes('--open'),
    skipVisualFollow: argv.includes('--skip-visual-follow'),
    bridge: argv.find((arg) => arg.startsWith('--bridge='))?.slice('--bridge='.length) || 'http://127.0.0.1:8899',
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: projectRoot, encoding: 'utf8', ...options });
  return {
    ok: result.status === 0,
    exitCode: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function jsonCommand(command, args, allowFailure = false) {
  const result = run(command, args);
  if (!allowFailure && !result.ok) throw new Error(result.stderr || result.stdout || `${command} failed`);
  const text = result.stdout || result.stderr || '{}';
  const start = text.indexOf('{');
  return {
    result,
    json: start >= 0 ? JSON.parse(text.slice(start)) : null,
  };
}

const args = parseArgs(process.argv);
const actions = [];

if (args.open) {
  const opened = run('termux-open-url', [routeUrl]);
  actions.push({ action: 'open-route', ok: opened.ok, exitCode: opened.exitCode });
}

if (!args.skipVisualFollow) {
  const visual = run('node', [
    'tools/pose_lab_weapon_visual_follow.mjs',
    '--bridge', args.bridge,
    '--out', 'generated/weapon_visual_follow/latest',
  ]);
  actions.push({
    action: 'weapon-visual-follow',
    ok: visual.ok,
    exitCode: visual.exitCode,
    stdoutTail: visual.stdout.split(/\r?\n/).slice(-12).join('\n'),
    stderrTail: visual.stderr.split(/\r?\n/).slice(-12).join('\n'),
  });
}

const parity = jsonCommand('node', ['tools/pose_lab_visual_proof_divergence.mjs', '--json', '--no-fail'], true).json;
const caseVerdict = jsonCommand('node', ['tools/pose_lab_case.mjs', 'verify', '--case', 'meshy-saber-live-in-hand', '--run-checks', '--json'], true).json;
const weaponVerdict = jsonCommand('node', ['tools/pose_lab_case.mjs', 'verify', '--case', 'meshy-weapon-fk-pinning', '--json'], true).json;

const report = {
  schema: 'pose-lab-meshy-saber-visual-parity-refresh-v1',
  generatedAt: new Date().toISOString(),
  routeUrl,
  actions,
  parity,
  caseVerdict,
  weaponVerdict,
  nextCommand: parity?.ok
    ? 'node tools/pose_lab_case.mjs verify --case meshy-weapon-fk-pinning --run-checks --json'
    : (parity?.classification === 'visual-proof-divergence'
        ? 'fix the live runtime/attachment layer or refresh stale live evidence before touching offsets'
        : 'capture fresh live visual-follow evidence'),
};

console.log(JSON.stringify(report, null, 2));
if (!parity?.ok) process.exitCode = 1;
