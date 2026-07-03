#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const targets = new Map([
  ['firebase-hosting', ['generated/firebase_hosting']],
  ['firebase-visual-truth', ['generated/firebase_visual_truth/latest', 'generated/firebase_visual_truth/artifacts']],
  ['test-runs', ['generated/test_runs']],
]);

function usage() {
  return [
    'Usage: node tools/clean_pose_lab_cache.mjs --target <name|all> [--apply]',
    '',
    'Targets:',
    ...[...targets.keys()].map((key) => `  - ${key}`),
    '  - all',
    '',
    'Default is dry-run. Use --apply to delete allowlisted generated cache paths.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { target: '', apply: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target') args.target = String(argv[++i] || '');
    else if (arg.startsWith('--target=')) args.target = arg.slice('--target='.length);
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function safePath(relPath) {
  const full = path.resolve(projectRoot, relPath);
  const generatedRoot = path.join(projectRoot, 'generated') + path.sep;
  if (!full.startsWith(generatedRoot)) throw new Error(`refusing non-generated cleanup path: ${relPath}`);
  return full;
}

const args = parseArgs(process.argv);
if (args.help || !args.target) {
  console.log(usage());
  process.exit(args.help ? 0 : 1);
}

const selected = args.target === 'all'
  ? [...targets.values()].flat()
  : targets.get(args.target);

if (!selected) throw new Error(`unknown cleanup target: ${args.target}`);

const report = {
  schema: 'pose-lab-cache-cleanup-v1',
  target: args.target,
  apply: args.apply,
  paths: selected.map((relPath) => {
    const full = safePath(relPath);
    const exists = fs.existsSync(full);
    if (args.apply && exists) fs.rmSync(full, { recursive: true, force: true });
    return {
      path: relPath,
      existed: exists,
      removed: args.apply && exists && !fs.existsSync(full),
    };
  }),
};

console.log(JSON.stringify(report, null, 2));
