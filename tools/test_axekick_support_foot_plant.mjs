import { execFileSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const metrics = JSON.parse(execFileSync('python3', ['tools/measure_poseclip_world_metrics.py', '--poseclip', 'assets/pose_indexes/ares_axekick_sf2.poseclip.json', '--view', 'xz'], {
  cwd: projectRoot,
  encoding: 'utf8',
}));
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const frames = metrics.frames.filter((frame) => ['start', 'anticipation', 'contact', 'contactHold', 'recoil', 'recoverySettle', 'settle'].includes(frame.tag));
const start = frames.find((frame) => frame.tag === 'start');
const anchor = start.positions.rightFoot;
for (const frame of frames) {
  const pos = frame.positions.rightFoot;
  const drift = Math.sqrt(((pos[0] - anchor[0]) ** 2) + ((pos[1] - anchor[1]) ** 2) + ((pos[2] - anchor[2]) ** 2));
  assert(drift <= 0.03, `AxeKick planted support foot drifts at ${frame.tag} by ${drift.toFixed(3)} from start anchor`);
}

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_axekick_support_foot_plant');
