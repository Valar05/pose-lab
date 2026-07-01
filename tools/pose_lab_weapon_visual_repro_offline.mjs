#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultClip = 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]';

const forwarded = [];
let sawClip = false;
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg === '--screenshot' || arg.startsWith('--screenshot=')) {
    if (arg === '--screenshot') i += 1;
    continue;
  }
  if (arg === '--clip' || arg.startsWith('--clip=')) sawClip = true;
  forwarded.push(arg);
}
if (!sawClip) forwarded.push('--clip', defaultClip);

const run = spawnSync('node', [path.join(projectRoot, 'tools', 'pose_lab_offline_render.mjs'), ...forwarded], {
  cwd: projectRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status ?? 1);
