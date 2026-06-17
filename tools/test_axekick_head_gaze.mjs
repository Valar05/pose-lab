import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
const metrics = JSON.parse(execFileSync('python3', ['tools/measure_poseclip_world_metrics.py', '--poseclip', 'assets/pose_indexes/ares_axekick_sf2.poseclip.json', '--view', 'xz'], {
  cwd: projectRoot,
  encoding: 'utf8',
}));
const poseclip = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_axekick_sf2.poseclip.json'), 'utf8'));
const evidence = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_axekick_sf2_visual_evidence.json'), 'utf8'));
const userData = poseclip.clip.userData || {};
const gaze = userData.headGazeStabilization;

function frame(tag) {
  const found = metrics.frames.find((item) => item.tag === tag);
  if (!found) throw new Error(`missing metrics frame ${tag}`);
  return found;
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(userData.headDiscipline?.enabled === false, 'head discipline must stay disabled; gaze correction should not revive spine/head counter-rotation');
assert(gaze?.enabled === true, 'AxeKick should publish enabled headGazeStabilization metadata');
assert(gaze?.mode === 'local-neck-head-gaze-lift', `unexpected head gaze mode ${gaze?.mode}`);
assert(JSON.stringify(gaze?.targetBones || []) === JSON.stringify(['mixamorig:Neck', 'mixamorig:Head']), `head gaze should only target Neck/Head, got ${JSON.stringify(gaze?.targetBones)}`);
assert((gaze?.timeline || []).some((phase) => phase.spriteFrame === 22 && phase.strength === 1), 'head gaze timeline should peak at contact frame 22');
assert((gaze?.timeline || []).some((phase) => phase.spriteFrame === 33 && phase.strength === 1), 'head gaze timeline should hold through contactHold frame 33');

for (const tag of ['contact', 'contactHold']) {
  const f = frame(tag);
  assert(f.orientation?.headForwardAxis === 'mixamorig:Head local +Z', `${tag}: missing head forward orientation basis`);
  assert(f.orientation.headForwardY >= -0.42, `${tag}: fighter is looking down too much (headForwardY=${f.orientation.headForwardY.toFixed(3)}); expected >= -0.42`);
  assert(f.orientation.headForwardY <= -0.13, `${tag}: fighter gaze is too level after 10-degree downward allowance (headForwardY=${f.orientation.headForwardY.toFixed(3)}); expected <= -0.13`);
  assert(f.xz.leftFootMinusHeadForward >= 0.28, `${tag}: attacking foot must remain clearly ahead of head (${f.xz.leftFootMinusHeadForward.toFixed(3)}); expected >= 0.28`);
}

for (const tag of ['start', 'apex', 'settle']) {
  const f = frame(tag);
  assert(f.orientation.headForwardY <= -0.12, `${tag}: gaze correction should not flatten every pose into a forward stare (headForwardY=${f.orientation.headForwardY.toFixed(3)})`);
}

assert(evidence.headGazeStabilization?.enabled === true, 'visual evidence should include enabled headGazeStabilization metadata');
const contactSlot = evidence.captureSlots?.find((slot) => slot.tag === 'contact');
assert(contactSlot?.headGazeStabilization?.some((phase) => phase.tag === 'contactLookUp' && phase.strength === 1), 'contact evidence should include contactLookUp gaze phase');

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_axekick_head_gaze');
console.log(JSON.stringify({
  contactHeadForwardY: Number(frame('contact').orientation.headForwardY.toFixed(3)),
  contactHoldHeadForwardY: Number(frame('contactHold').orientation.headForwardY.toFixed(3)),
  targetBones: gaze.targetBones,
}, null, 2));
