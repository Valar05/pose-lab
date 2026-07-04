#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const tmpRoot = '/data/data/com.termux/files/usr/tmp';
const targets = new Map([
  ['firebase-hosting', [{ kind: 'project', path: 'generated/firebase_hosting' }]],
  ['firebase-visual-truth', [
    { kind: 'project', path: 'generated/firebase_visual_truth/latest' },
    { kind: 'project', path: 'generated/firebase_visual_truth/artifacts' },
    { kind: 'tmp-glob', path: 'firebase-visual-truth-' },
  ]],
  ['browser-prune', [{ kind: 'tmp-glob', path: 'android-chrome-tab-prune' }]],
  ['test-runs', [{ kind: 'project', path: 'generated/test_runs' }]],
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

function safeProjectPath(relPath) {
  const full = path.resolve(projectRoot, relPath);
  const generatedRoot = path.join(projectRoot, 'generated') + path.sep;
  if (!full.startsWith(generatedRoot)) throw new Error(`refusing non-generated cleanup path: ${relPath}`);
  return { full, label: relPath };
}

function safeTmpGlob(prefix) {
  if (!/^[a-zA-Z0-9._-]+$/.test(prefix)) throw new Error(`refusing unsafe tmp prefix: ${prefix}`);
  const entries = fs.existsSync(tmpRoot) ? fs.readdirSync(tmpRoot) : [];
  return entries
    .filter((entry) => entry === prefix || entry.startsWith(prefix))
    .map((entry) => {
      const full = path.resolve(tmpRoot, entry);
      if (!full.startsWith(tmpRoot + path.sep)) throw new Error(`refusing tmp path outside tmp root: ${entry}`);
      return { full, label: path.join(tmpRoot, entry) };
    });
}

function expandTarget(entry) {
  if (entry.kind === 'project') return [safeProjectPath(entry.path)];
  if (entry.kind === 'tmp-glob') return safeTmpGlob(entry.path);
  throw new Error(`unknown cleanup entry kind: ${entry.kind}`);
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
  paths: selected.flatMap(expandTarget).map(({ full, label }) => {
    const exists = fs.existsSync(full);
    if (args.apply && exists) fs.rmSync(full, { recursive: true, force: true });
    return {
      path: label,
      existed: exists,
      removed: args.apply && exists && !fs.existsSync(full),
    };
  }),
};

console.log(JSON.stringify(report, null, 2));
