import { execFileSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function metricsFor(poseclip) {
  return JSON.parse(execFileSync('python3', ['tools/measure_poseclip_world_metrics.py', '--poseclip', poseclip, '--view', 'xz'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }));
}

function distance(a, b) {
  return Math.sqrt(((a[0] - b[0]) ** 2) + ((a[1] - b[1]) ** 2) + ((a[2] - b[2]) ** 2));
}

const cases = [
  {
    attackName: 'AxeKick',
    poseclip: 'assets/pose_indexes/ares_axekick_sf2.poseclip.json',
    foot: 'rightFoot',
    anchorTag: 'start',
    tags: ['start', 'anticipation', 'anticipationHold', 'lift', 'apex', 'apexHold', 'snap', 'contact', 'contactHold', 'recoil', 'recoverySettle', 'settle'],
  },
  {
    attackName: 'FrontKick',
    poseclip: 'assets/pose_indexes/ares_frontkick_sf2.poseclip.json',
    foot: 'rightFoot',
    anchorTag: 'start',
    tags: ['start', 'anticipation', 'contact', 'contactHold', 'recoil', 'recoilSettle', 'settle'],
  },
  {
    attackName: 'LowBackKick',
    poseclip: 'assets/pose_indexes/ares_lowbackkick_sf2.poseclip.json',
    foot: 'leftFoot',
    anchorTag: 'start',
    tags: ['start', 'windup', 'anticipation', 'anticipationHold', 'contact', 'contactHold', 'recoil', 'settle'],
  },
  {
    attackName: 'AxleKick',
    poseclip: 'assets/pose_indexes/ares_axlekick_sf2.poseclip.json',
    foot: 'leftFoot',
    anchorTag: 'anticipation',
    tags: ['anticipation', 'snap', 'contact', 'contactHold', 'recoil'],
  },
];

for (const spec of cases) {
  const metrics = metricsFor(spec.poseclip);
  const byTag = new Map(metrics.frames.map((frame) => [frame.tag, frame]));
  const anchor = byTag.get(spec.anchorTag)?.positions?.[spec.foot];
  assert(Boolean(anchor), `${spec.attackName}: missing ${spec.anchorTag} anchor for ${spec.foot}`);
  for (const tag of spec.tags) {
    const frame = byTag.get(tag);
    assert(Boolean(frame), `${spec.attackName}: missing frame ${tag}`);
    if (!anchor || !frame) continue;
    const drift = distance(frame.positions[spec.foot], anchor);
    assert(drift <= 0.03, `${spec.attackName}: planted ${spec.foot} drifts at ${tag} by ${drift.toFixed(3)} from ${spec.anchorTag}`);
  }
}

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_attack_foot_plant_contract');
