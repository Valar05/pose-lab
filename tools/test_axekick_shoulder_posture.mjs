import { execFileSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
const metrics = JSON.parse(execFileSync('python3', ['tools/measure_poseclip_world_metrics.py', '--poseclip', 'assets/pose_indexes/ares_axekick_sf2.poseclip.json', '--view', 'xz'], {
  cwd: projectRoot,
  encoding: 'utf8',
}));

function frame(tag) {
  const found = metrics.frames.find((item) => item.tag === tag);
  if (!found) throw new Error(`missing metrics frame ${tag}`);
  return found;
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

for (const tag of ['contact', 'contactHold']) {
  const f = frame(tag);
  assert(f.posture.shoulderForwardFromSpine2Z <= 0.04, `${tag}: contact shoulders still round forward and cave the strike (${f.posture.shoulderForwardFromSpine2Z.toFixed(3)}); expected <= 0.04`);
  assert(f.posture.shoulderUpFromSpine2Y >= 0.105, `${tag}: contact shoulders still slump instead of staying proud through impact (${f.posture.shoulderUpFromSpine2Y.toFixed(3)}); expected >= 0.105`);
}

for (const tag of ['recoil', 'recoverySettle', 'settle']) {
  const f = frame(tag);
  assert(f.posture.shoulderForwardFromSpine2Z <= 0.04, `${tag}: recovery shoulders remain rounded forward (${f.posture.shoulderForwardFromSpine2Z.toFixed(3)}); expected <= 0.04`);
}

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_axekick_shoulder_posture');
console.log(JSON.stringify({
  contactForward: Number(frame('contact').posture.shoulderForwardFromSpine2Z.toFixed(3)),
  contactUp: Number(frame('contact').posture.shoulderUpFromSpine2Y.toFixed(3)),
  recoilForward: Number(frame('recoil').posture.shoulderForwardFromSpine2Z.toFixed(3)),
}, null, 2));
