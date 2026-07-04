#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = '/data/data/com.termux/files/usr/tmp';
const defaultPrefixes = [
  'firebase-visual-truth-',
  'pose-lab-parity-promotion-',
  'pose-lab-three-node',
  'pose-lab-weapon-stick-',
  'poseclip-stickframe-',
];

function parseArgs(argv) {
  const args = {
    apply: false,
    olderThanHours: 0,
    prefixes: [...defaultPrefixes],
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.apply = false;
    else if (arg === '--older-than-hours') args.olderThanHours = Number(argv[++i] || 0);
    else if (arg.startsWith('--older-than-hours=')) args.olderThanHours = Number(arg.slice('--older-than-hours='.length));
    else if (arg === '--prefix') args.prefixes.push(String(argv[++i] || ''));
    else if (arg.startsWith('--prefix=')) args.prefixes.push(arg.slice('--prefix='.length));
    else throw new Error(`unknown argument: ${arg}`);
  }
  args.prefixes = [...new Set(args.prefixes.map((value) => String(value || '').trim()).filter(Boolean))];
  if (!Number.isFinite(args.olderThanHours) || args.olderThanHours < 0) throw new Error(`invalid --older-than-hours: ${args.olderThanHours}`);
  return args;
}

function safeTmpChild(entryPath) {
  const resolvedRoot = path.resolve(tmpRoot);
  const resolved = path.resolve(entryPath);
  return resolved.startsWith(`${resolvedRoot}${path.sep}`) && resolved !== resolvedRoot;
}

function collectCandidates({ prefixes, olderThanHours }) {
  if (!fs.existsSync(tmpRoot)) return [];
  const now = Date.now();
  const minAgeMs = olderThanHours * 60 * 60 * 1000;
  const entries = fs.readdirSync(tmpRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => prefixes.some((prefix) => entry.name.startsWith(prefix)))
    .map((entry) => {
      const fullPath = path.join(tmpRoot, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        path: fullPath,
        name: entry.name,
        ageHours: Number(((now - stat.mtimeMs) / 1000 / 60 / 60).toFixed(2)),
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .filter((entry) => entry.ageHours >= olderThanHours)
    .filter((entry) => safeTmpChild(entry.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function removeCandidate(candidate) {
  if (!safeTmpChild(candidate.path)) throw new Error(`refusing unsafe tmp cleanup path: ${candidate.path}`);
  fs.rmSync(candidate.path, { recursive: true, force: true });
}

const args = parseArgs(process.argv);
const candidates = collectCandidates(args);
const removed = [];
if (args.apply) {
  for (const candidate of candidates) {
    removeCandidate(candidate);
    removed.push(candidate.path);
  }
}

console.log(JSON.stringify({
  command: 'clean-pose-lab-tmp',
  mode: args.apply ? 'apply' : 'dry-run',
  tmpRoot,
  tmpdir: os.tmpdir(),
  prefixes: args.prefixes,
  olderThanHours: args.olderThanHours,
  candidateCount: candidates.length,
  candidates,
  removed,
}, null, 2));
