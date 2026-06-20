import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openai-critique-runner-'));
const failures = [];

function runJson(command, args) {
  const output = execFileSync(command, args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(output);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const poseclip = 'assets/pose_indexes/ares_axekick_sf2.poseclip.json';
const runOut = path.join(tmpRoot, 'single');
const single = runJson('python3', [
  'tools/call_openai_critique.py',
  '--poseclip', poseclip,
  '--out', runOut,
  '--model', 'test-openai-model',
  '--image-limit', '3',
  '--detail', 'low',
  '--dry-run',
]);
assert(single.schema === 'pose-lab-openai-critique-run-v1', 'single schema mismatch');
assert(single.dryRun === true, 'single should be dry-run');
assert(single.model === 'test-openai-model', 'single model mismatch');
assert(single.imageCount === 3, `expected 3 selected images, got ${single.imageCount}`);
assert(single.packetSummary.schema === 'pose-lab-critique-packet-build-v1', 'single packet schema mismatch');
assert(single.packetSummary.fps === 30, `single packet fps should default to 30, got ${single.packetSummary.fps}`);
assert(single.beforeAfter && single.beforeAfter.schema === 'pose-lab-before-after-packet-v1', 'before-after packet missing');
const requestPreviewPath = path.join(runOut, 'request_preview.json');
const requestMetaPath = path.join(runOut, 'request_meta.json');
assert(fs.existsSync(requestPreviewPath), 'single request preview missing');
assert(fs.existsSync(requestMetaPath), 'single request meta missing');
const requestPreview = JSON.parse(fs.readFileSync(requestPreviewPath, 'utf8'));
const requestMeta = JSON.parse(fs.readFileSync(requestMetaPath, 'utf8'));
assert(requestPreview.model === 'test-openai-model', 'request preview model mismatch');
assert(Array.isArray(requestPreview.input) && requestPreview.input.length === 1, 'request input shape mismatch');
const content = requestPreview.input[0].content;
assert(content.some((item) => item.type === 'input_image'), 'request preview missing image inputs');
assert(content.filter((item) => item.type === 'input_image').length === 3, 'request preview image input count mismatch');
assert(requestMeta.selectedImages.length === 3, 'request meta selectedImages mismatch');
assert(requestMeta.selectedImages[0].tag === 'contact' || requestMeta.selectedImages[0].tag === 'contactHold', 'request meta did not prioritize contact image');

const batchOut = path.join(tmpRoot, 'batch');
const batch = runJson('python3', [
  'tools/batch_openai_critiques.py',
  '--poseclip', 'assets/pose_indexes/ares_axekick_sf2.poseclip.json',
  '--poseclip', 'assets/pose_indexes/ares_lowbackkick_sf2.poseclip.json',
  '--out', batchOut,
  '--model', 'test-openai-model',
  '--image-limit', '2',
  '--dry-run',
]);
assert(batch.schema === 'pose-lab-openai-critique-batch-v1', 'batch schema mismatch');
assert(batch.count === 2, `expected batch count 2, got ${batch.count}`);
assert(batch.dryRun === true, 'batch should be dry-run');
assert(batch.runs.every((run) => run.schema === 'pose-lab-openai-critique-run-v1'), 'batch contains invalid run schema');
assert(fs.existsSync(path.join(batchOut, 'batch_manifest.json')), 'batch manifest missing');

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_openai_critique_runner');
console.log(JSON.stringify({ tmpRoot, checked: ['single-dry-run', 'request-preview', 'batch-dry-run'] }, null, 2));
