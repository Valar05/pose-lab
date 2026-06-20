import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(os.tmpdir(), `poseclip-step-${process.pid}`);
const manifestPath = path.join(outDir, 'manifest.json');

execFileSync('python3', [
  path.join(projectRoot, 'tools', 'render_poseclip_stickframes.py'),
  '--poseclip',
  'assets/pose_indexes/ares_axekick_sf2.poseclip.json',
  '--out',
  outDir,
  '--frames',
  'step',
  '--fps',
  '30',
  '--no-video',
], {
  cwd: projectRoot,
  stdio: 'pipe',
});

if (!fs.existsSync(manifestPath)) throw new Error(`missing render manifest ${manifestPath}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];

if (manifest.framesMode !== 'step') failures.push(`unexpected framesMode ${manifest.framesMode}`);
if (manifest.fps !== 30) failures.push(`unexpected fps ${manifest.fps}`);
if (!(manifest.frames || []).length) failures.push('no frames rendered');

for (const frame of manifest.frames || []) {
  if (!/^f\d{3}$/.test(String(frame.tag || ''))) failures.push(`frame tag not stepped: ${frame.tag}`);
  if (!String(frame.evidenceKey || '').endsWith(':step')) failures.push(`frame evidence key not stepped: ${frame.evidenceKey}`);
}

const keyMarkers = new Map(manifest.frames.filter((frame) => frame.markerTag).map((frame) => [frame.spriteFrame, frame.markerTag]));
for (const [spriteFrame, markerTag] of [[0, 'start'], [6, 'anticipation'], [22, 'contact'], [40, 'settle']]) {
  if (keyMarkers.get(spriteFrame) !== markerTag) failures.push(`expected markerTag ${markerTag} at frame ${spriteFrame}, got ${keyMarkers.get(spriteFrame) || 'none'}`);
}

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_poseclip_step_frames');
console.log(JSON.stringify({ manifest: path.relative(projectRoot, manifestPath), frames: manifest.frames.length, fps: manifest.fps }, null, 2));
