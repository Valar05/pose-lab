import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-critique-runner-'));
const failures = [];

function runJson(command, args) {
  const output = execFileSync(command, args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(output);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const poseclip = 'assets/pose_indexes/ares_axekick_sf2.poseclip.json';
const outDir = path.join(tmpRoot, 'codex');
const run = runJson('python3', [
  'tools/call_codex_critique.py',
  '--poseclip', poseclip,
  '--out', outDir,
  '--model', 'test-codex-model',
  '--image-limit', '2',
  '--dry-run',
]);
assert(run.schema === 'pose-lab-codex-critique-run-v1', 'run schema mismatch');
assert(run.dryRun === true, 'run should be dry-run');
assert(run.model === 'test-codex-model', 'model mismatch');
assert(run.packetSummary?.schema === 'pose-lab-critique-packet-build-v1', 'packet schema mismatch');
assert(run.requestMeta?.selectedImages?.length === 2, 'selected image count mismatch');
assert(fs.existsSync(path.join(outDir, 'prompt.md')), 'prompt.md missing');
assert(fs.existsSync(path.join(outDir, 'request_meta.json')), 'request_meta.json missing');
const prompt = fs.readFileSync(path.join(outDir, 'prompt.md'), 'utf8');
assert(prompt.includes('SF2 Critique Guide'), 'prompt missing guide text');
assert(prompt.includes('Render Manifest Excerpt'), 'prompt missing manifest excerpt');
const meta = JSON.parse(fs.readFileSync(path.join(outDir, 'request_meta.json'), 'utf8'));
assert(meta.schema === 'pose-lab-codex-critique-request-v1', 'request meta schema mismatch');
assert(meta.promptLength > 0, 'prompt length missing');
assert(meta.selectedImages.every((item) => item.png), 'selected images missing png paths');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ tmpRoot, checked: ['dry-run', 'prompt', 'request-meta'] }, null, 2));
