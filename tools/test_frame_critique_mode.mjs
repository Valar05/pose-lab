import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-critique-mode-'));
const evidencePath = path.join(tmpRoot, 'axe_evidence.json');
const packetOut = path.join(tmpRoot, 'packet');
const openaiOut = path.join(tmpRoot, 'openai');
fs.copyFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_axekick_sf2_visual_evidence.json'), evidencePath);
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function runJson(command, args) {
  const output = execFileSync(command, args, { cwd: projectRoot, encoding: 'utf8' });
  return JSON.parse(output);
}

const note = runJson('python3', [
  'tools/record_frame_critique.py',
  '--attack', 'AxeKick',
  '--tag', 'contact',
  '--comment', 'heel should settle first',
  '--mark', 'circle-heel',
  '--bone', 'mixamorig:LeftFoot',
  '--evidence', evidencePath,
]);
assert(note.schema === 'pose-lab-frame-critique-note-v1', 'note schema mismatch');

const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
assert(evidence.critiqueMode?.kind === 'grease-pencil-comment-v1', 'critique mode missing from evidence');
const contact = evidence.captureSlots.find((slot) => slot.tag === 'contact');
assert(contact?.annotations?.length === 1, 'contact annotation missing');
assert(contact.annotations[0].comment === 'heel should settle first', 'annotation comment mismatch');
assert(contact.annotations[0].bones.includes('mixamorig:LeftFoot'), 'annotation bone missing');
assert(contact.annotations[0].marks.includes('circle-heel'), 'annotation mark missing');

const packet = runJson('python3', [
  'tools/build_critique_packet.py',
  '--poseclip', 'assets/pose_indexes/ares_axekick_sf2.poseclip.json',
  '--out', packetOut,
  '--view', 'xz',
  '--evidence', evidencePath,
]);
assert(packet.schema === 'pose-lab-critique-packet-build-v1', 'packet schema mismatch');
const manifest = JSON.parse(fs.readFileSync(path.join(packetOut, 'manifest.json'), 'utf8'));
assert(manifest.critiqueMode?.kind === 'grease-pencil-comment-v1', 'render manifest did not retain critique mode');
const critiquePacket = fs.readFileSync(path.join(packetOut, 'critique_packet.md'), 'utf8');
assert(critiquePacket.includes('heel should settle first'), 'critique packet missing frame comment');
assert(critiquePacket.includes('grease-pencil-comment-v1'), 'critique packet missing critique mode');

const openai = runJson('python3', [
  'tools/call_openai_critique.py',
  '--poseclip', 'assets/pose_indexes/ares_axekick_sf2.poseclip.json',
  '--evidence', evidencePath,
  '--out', openaiOut,
  '--model', 'test-openai-model',
  '--image-limit', '2',
  '--dry-run',
]);
assert(openai.schema === 'pose-lab-openai-critique-run-v1', 'openai run schema mismatch');
const requestPreview = JSON.parse(fs.readFileSync(path.join(openaiOut, 'request_preview.json'), 'utf8'));
const requestText = JSON.stringify(requestPreview);
assert(requestText.includes('heel should settle first'), 'openai request preview missing annotation comment');
assert(requestText.includes('grease-pencil-comment-v1'), 'openai request preview missing critique mode');

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_frame_critique_mode');
console.log(JSON.stringify({ tmpRoot, checked: ['note', 'packet', 'openai'] }, null, 2));
