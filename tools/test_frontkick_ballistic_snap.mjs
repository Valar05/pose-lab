import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
const payload = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_frontkick_sf2.poseclip.json'), 'utf8'));
const clip = payload.clip || payload;
const frames = clip.userData?.sourceReduction?.spriteFrames || [];
const byTag = new Map(frames.map((frame) => [frame.tag, frame]));
const metrics = JSON.parse(execFileSync('python3', ['tools/measure_poseclip_world_metrics.py', '--poseclip', 'assets/pose_indexes/ares_frontkick_sf2.poseclip.json', '--view', 'xz'], { cwd: projectRoot, encoding: 'utf8' }));

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

const anticipation = frame('anticipation');
const contact = frame('contact');
const contactHold = frame('contactHold');
const recoil = frame('recoil');
const recoilSettle = frame('recoilSettle');

assert(!byTag.has('anticipationHold'), 'FrontKick should not use a held anticipation pose');
assert(Number(anticipation.sourceTime.toFixed(5)) === 0.2, `FrontKick anticipation should keep the brief chamber at 0.20000, got ${anticipation.sourceTime}`);
assert(Number(contact.sourceTime.toFixed(5)) === 0.36667, `FrontKick contact should preserve the explosive extension frame at 0.36667, got ${contact.sourceTime}`);
assert(Number(contactHold.sourceTime.toFixed(5)) === 0.36667, `FrontKick contactHold should freeze the same extension frame at 0.36667, got ${contactHold.sourceTime}`);
assert(Number(recoil.sourceTime.toFixed(5)) === 0.5, `FrontKick recoil should preserve the early retraction start frame at 0.50000, got ${recoil.sourceTime}`);
assert(Number(recoilSettle.sourceTime.toFixed(5)) === 0.56667, `FrontKick recoilSettle should preserve the visible snap-back frame at 0.56667, got ${recoilSettle.sourceTime}`);
assert(contactHold.spriteFrame - contact.spriteFrame <= 2, `FrontKick contact hold is too long (${contactHold.spriteFrame - contact.spriteFrame} frames); expected <= 2`);
assert(recoil.spriteFrame - contact.spriteFrame <= 4, `FrontKick recoil is too delayed (${recoil.spriteFrame - contact.spriteFrame} frames); expected <= 4`);
assert(recoilSettle.spriteFrame - recoil.spriteFrame <= 3, `FrontKick recoilSettle should follow recoil quickly (${recoilSettle.spriteFrame - recoil.spriteFrame} frames); expected <= 3`);

const anticipationMetric = metric('anticipation');
const contactMetric = metric('contact');
const holdMetric = metric('contactHold');
const recoilMetric = metric('recoil');

assert(contactMetric.positions.leftFoot[1] - anticipationMetric.positions.leftFoot[1] >= 1.0, `FrontKick extension should launch much higher than chamber (${(contactMetric.positions.leftFoot[1] - anticipationMetric.positions.leftFoot[1]).toFixed(3)}); expected >= 1.0`);
const recoilSettleMetric = metric('recoilSettle');
assert(contactMetric.positions.leftFoot[2] - recoilSettleMetric.positions.leftFoot[2] >= 0.9, `FrontKick recoilSettle should visibly retract the foot path (${(contactMetric.positions.leftFoot[2] - recoilSettleMetric.positions.leftFoot[2]).toFixed(3)}); expected >= 0.9`);
assert(Math.abs(holdMetric.positions.leftFoot[2] - contactMetric.positions.leftFoot[2]) <= 0.02, `FrontKick contact hold should be almost nonexistent in foot path (${Math.abs(holdMetric.positions.leftFoot[2] - contactMetric.positions.leftFoot[2]).toFixed(3)}); expected <= 0.02`);

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_frontkick_ballistic_snap');
console.log(JSON.stringify({
  schedule: {
    anticipation: anticipation.sourceTime,
    contact: contact.sourceTime,
    contactHoldFrames: contactHold.spriteFrame - contact.spriteFrame,
    recoil: recoil.sourceTime,
    recoilSettle: recoilSettle.sourceTime,
  },
}, null, 2));
