#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {
    blender: process.env.BLENDER_PATH || '',
    dryRun: false,
    json: false,
    probe: false,
    timeoutMs: 180000,
    renderDir: 'authoring/meshy_saber/exports/headless_review',
    exportJson: 'authoring/meshy_saber/exports/meshy_ready_saber_contract.json',
    saveBlend: '',
    exportGlb: '',
    resolution: 960,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--probe') args.probe = true;
    else if (arg === '--blender') args.blender = String(argv[++i] || '');
    else if (arg.startsWith('--blender=')) args.blender = arg.slice('--blender='.length);
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++i] || args.timeoutMs);
    else if (arg.startsWith('--timeout-ms=')) args.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    else if (arg === '--render-dir') args.renderDir = String(argv[++i] || '');
    else if (arg.startsWith('--render-dir=')) args.renderDir = arg.slice('--render-dir='.length);
    else if (arg === '--export-json') args.exportJson = String(argv[++i] || '');
    else if (arg.startsWith('--export-json=')) args.exportJson = arg.slice('--export-json='.length);
    else if (arg === '--save-blend') args.saveBlend = String(argv[++i] || '');
    else if (arg.startsWith('--save-blend=')) args.saveBlend = arg.slice('--save-blend='.length);
    else if (arg === '--export-glb') args.exportGlb = String(argv[++i] || '');
    else if (arg.startsWith('--export-glb=')) args.exportGlb = arg.slice('--export-glb='.length);
    else if (arg === '--resolution') args.resolution = Number(argv[++i] || args.resolution);
    else if (arg.startsWith('--resolution=')) args.resolution = Number(arg.slice('--resolution='.length));
  }
  return args;
}

function findBlender(explicit) {
  if (explicit) {
    return fs.existsSync(explicit) || !explicit.includes('/') ? explicit : '';
  }
  for (const candidate of [
    '/usr/bin/blender',
    '/data/data/com.termux/files/usr/bin/blender',
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const found = spawnSync('sh', ['-lc', 'command -v blender'], { encoding: 'utf8' });
  return found.status === 0 ? found.stdout.trim() : '';
}

function buildCommand(blender, args) {
  const blenderArgs = [
    '--background',
    '--python',
    'authoring/meshy_saber/blender_build_meshy_ready_authoring.py',
    '--',
    '--repo-root',
    '.',
    '--resolution',
    String(args.resolution),
  ];
  if (args.renderDir) blenderArgs.push('--render-dir', args.renderDir);
  if (args.exportJson) blenderArgs.push('--export-json', args.exportJson);
  if (args.saveBlend) blenderArgs.push('--save-blend', args.saveBlend);
  if (args.exportGlb) blenderArgs.push('--export-glb', args.exportGlb);
  return { command: blender, args: blenderArgs };
}

function artifact(relativePath) {
  if (!relativePath) return { path: '', exists: false };
  const absolute = path.join(projectRoot, relativePath);
  return { path: relativePath, exists: fs.existsSync(absolute), bytes: fs.existsSync(absolute) ? fs.statSync(absolute).size : 0 };
}

function run() {
  const args = parseArgs(process.argv);
  const blender = findBlender(args.blender);
  const report = {
    schema: 'pose-lab-meshy-saber-blender-workbench-v1',
    ok: false,
    status: '',
    blender: blender || null,
    command: null,
    artifacts: {},
  };

  if (!blender) {
    report.status = 'LOCAL_BLENDER_UNAVAILABLE';
    report.message = 'No local blender executable found. Set BLENDER_PATH or install a terminal-runnable Blender; do not fall back to Cauldron without explicit permission.';
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.error(`${report.status}: ${report.message}`);
    process.exit(args.probe || args.dryRun ? 0 : 1);
  }

  if (args.probe) {
    const version = spawnSync(blender, ['--version'], { cwd: projectRoot, encoding: 'utf8', timeout: 15000 });
    report.ok = version.status === 0;
    report.status = report.ok ? 'LOCAL_BLENDER_READY' : 'LOCAL_BLENDER_PROBE_FAILED';
    report.version = version.stdout.split('\n').slice(0, 4).join('\n');
    report.stderr = version.stderr;
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log(report.ok ? report.version : `${report.status}\n${report.stderr}`);
    process.exit(report.ok ? 0 : 1);
  }

  const command = buildCommand(blender, args);
  report.command = [command.command, ...command.args];
  if (args.dryRun) {
    report.ok = true;
    report.status = 'DRY_RUN';
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log(report.command.join(' '));
    return;
  }

  const result = spawnSync(command.command, command.args, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: args.timeoutMs,
  });
  report.exitCode = result.status;
  report.signal = result.signal;
  report.stdout = result.stdout;
  report.stderr = result.stderr;
  report.ok = result.status === 0;
  report.status = report.ok ? 'HEADLESS_BLENDER_ARTIFACTS_WRITTEN' : 'HEADLESS_BLENDER_FAILED';
  report.artifacts = {
    contractJson: artifact(args.exportJson),
    tposePng: artifact(path.join(args.renderDir, 'meshy_saber_tpose.png')),
    readyPng: artifact(path.join(args.renderDir, 'meshy_saber_ready.png')),
    contactSheet: artifact(path.join(args.renderDir, 'meshy_saber_contact_sheet.html')),
    blend: artifact(args.saveBlend),
    glb: artifact(args.exportGlb),
  };
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.status}: ${report.ok ? 'ok' : 'failed'}`);
    for (const item of Object.values(report.artifacts)) {
      if (item.path) console.log(`${item.exists ? 'WROTE' : 'MISS'} ${item.path}`);
    }
    if (!report.ok) {
      if (report.stdout) console.log(report.stdout);
      if (report.stderr) console.error(report.stderr);
    }
  }
  process.exit(report.ok ? 0 : 1);
}

run();
