import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
const payload = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_lowbackkick_sf2.poseclip.json'), 'utf8'));
const clip = payload.clip || payload;
const frames = clip.userData?.sourceReduction?.spriteFrames || [];
const byTag = new Map(frames.map((frame) => [frame.tag, frame]));
const metrics = JSON.parse(execFileSync('python3', ['tools/measure_poseclip_world_metrics.py', '--poseclip', 'assets/pose_indexes/ares_lowbackkick_sf2.poseclip.json', '--view', 'xz'], { cwd: projectRoot, encoding: 'utf8' }));

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function frame(tag) {
  const found = byTag.get(tag);
  if (!found) throw new Error(`missing sourceReduction frame ${tag}`);
  return found;
}

function metric(tag) {
  const found = metrics.frames.find((item) => item.tag === tag);
  if (!found) throw new Error(`missing metrics frame ${tag}`);
  return found;
}

const windup = byTag.get('windup');
const anticipation = frame('anticipation');
const anticipationHold = byTag.get('anticipationHold');
const contact = frame('contact');
const contactHold = frame('contactHold');
const recoil = frame('recoil');

assert(Boolean(windup), 'LowBackKick should have a windup chamber before anticipation');
assert(Boolean(anticipationHold), 'LowBackKick should have an explicit held chamber before contact');
if (windup) {
  assert(Number(windup.sourceTime.toFixed(5)) === 0.16667, `LowBackKick windup should start from the earlier coil at 0.16667, got ${windup.sourceTime}`);
}
assert(Number(anticipation.sourceTime.toFixed(5)) === 0.23333, `LowBackKick anticipation should preserve the heavier chamber at 0.23333, got ${anticipation.sourceTime}`);
if (anticipationHold) {
  assert(Number(anticipationHold.sourceTime.toFixed(5)) === 0.26667, `LowBackKick anticipationHold should settle into the denser chamber at 0.26667, got ${anticipationHold.sourceTime}`);
  assert(anticipationHold.spriteFrame - anticipation.spriteFrame >= 3, `LowBackKick chamber hold is too short (${anticipationHold.spriteFrame - anticipation.spriteFrame} frames); expected >= 3`);
}
assert(Number(contact.sourceTime.toFixed(5)) === 0.33333, `LowBackKick contact should keep the authored strike frame at 0.33333, got ${contact.sourceTime}`);
assert(Number(contactHold.sourceTime.toFixed(5)) === 0.33333, `LowBackKick contactHold should freeze the authored strike frame at 0.33333, got ${contactHold.sourceTime}`);
assert(Number(recoil.sourceTime.toFixed(5)) === 0.8, `LowBackKick recoil should preserve the loaded recovery at 0.8, got ${recoil.sourceTime}`);

const anticipationMetric = metric('anticipation');
const holdMetric = anticipationHold ? metric('anticipationHold') : null;
const contactMetric = metric('contact');

assert(anticipationMetric.orientation.headForwardY >= -0.16, `LowBackKick anticipation should keep the head conservative enough during chamber (${anticipationMetric.orientation.headForwardY.toFixed(3)}); expected >= -0.16`);
assert(anticipationMetric.positions.rightFoot[1] <= 0.31, `LowBackKick anticipation should keep the kicking foot tighter in chamber (${anticipationMetric.positions.rightFoot[1].toFixed(3)}); expected <= 0.31`);
const anticipationRightFootMinusHeadForward = anticipationMetric.positions.rightFoot[2] - anticipationMetric.positions.head[2];
assert(anticipationRightFootMinusHeadForward <= -0.38, `LowBackKick anticipation should keep the kick leg behind the body line (${anticipationRightFootMinusHeadForward.toFixed(3)}); expected <= -0.38`);
if (holdMetric) {
  assert(holdMetric.positions.rightFoot[1] <= 0.34, `LowBackKick held chamber should still read tucked rather than early extension (${holdMetric.positions.rightFoot[1].toFixed(3)}); expected <= 0.34`);
  const holdRightFootMinusHeadForward = holdMetric.positions.rightFoot[2] - holdMetric.positions.head[2];
  assert(holdRightFootMinusHeadForward <= -0.34, `LowBackKick held chamber should keep the heel behind the silhouette (${holdRightFootMinusHeadForward.toFixed(3)}); expected <= -0.34`);
}
assert(contactMetric.positions.rightFoot[1] >= 0.74, `LowBackKick contact should still reach a high extended strike (${contactMetric.positions.rightFoot[1].toFixed(3)}); expected >= 0.74`);

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_lowbackkick_heavy_chamber');
console.log(JSON.stringify({
  chamber: {
    windup: windup?.sourceTime,
    anticipation: anticipation.sourceTime,
    anticipationHold: anticipationHold?.sourceTime,
  },
  contact: contact.sourceTime,
}, null, 2));
