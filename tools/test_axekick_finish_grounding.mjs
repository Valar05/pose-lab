import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const payload = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_axekick_sf2.poseclip.json'), 'utf8'));
const clip = payload.clip || payload;
const reduction = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_axekick_sf2_reduction.json'), 'utf8'));
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const byTag = new Map(reduction.spriteFrames.map((frame) => [frame.tag, frame]));
const contact = byTag.get('contact');
const contactHold = byTag.get('contactHold');
const recoil = byTag.get('recoil');
const recoverySettle = byTag.get('recoverySettle');
const settle = byTag.get('settle');
const clampFromFrame = contactHold.spriteFrame + 1;
const clampToFrame = settle.spriteFrame - 1;

assert(contactHold.spriteFrame - contact.spriteFrame <= 7, `AxeKick contact hold is still too long (${contactHold.spriteFrame - contact.spriteFrame} frames)`);
assert(contactHold.spriteFrame - contact.spriteFrame >= 4, `AxeKick contact hold got too short (${contactHold.spriteFrame - contact.spriteFrame} frames)`);
assert(recoil.spriteFrame - contact.spriteFrame >= 8, `AxeKick recoil still starts too soon to read as recovery (${recoil.spriteFrame - contact.spriteFrame} frames)`);
assert(recoverySettle.spriteFrame - recoil.spriteFrame >= 3, `AxeKick recovery moving hold is too short (${recoverySettle.spriteFrame - recoil.spriteFrame} frames)`);
assert(Number(recoil.sourceTime.toFixed(5)) === 0.53333, `AxeKick recoil should use the early drag-back source frame 0.53333, got ${recoil.sourceTime}`);
assert(Number(recoverySettle.sourceTime.toFixed(5)) === 0.66667, `AxeKick recoverySettle should use the late drag-back source frame 0.66667, got ${recoverySettle.sourceTime}`);
assert(settle.spriteFrame > recoverySettle.spriteFrame, 'AxeKick settle should remain after recoverySettle');
assert(settle.sourceTime === contact.sourceTime || Number(settle.sourceTime.toFixed(5)) === Number(byTag.get('start').sourceTime.toFixed(5)), 'AxeKick settle should loop to the start pose source');

const metrics = JSON.parse(execFileSync('python3', ['tools/measure_poseclip_world_metrics.py', '--poseclip', 'assets/pose_indexes/ares_axekick_sf2.poseclip.json', '--frames', 'all', '--view', 'xz'], { cwd: projectRoot, encoding: 'utf8' }));
const frames = new Map(metrics.frames.map((frame) => [frame.spriteFrame, frame]));

function legLineAngle(frame) {
  const hips = frame.positions.hips;
  const foot = frame.positions.leftFoot;
  const dy = foot[1] - hips[1];
  const dz = foot[2] - hips[2];
  return Math.atan2(dy, dz) * 180 / Math.PI;
}

const contactFrame = frames.get(contact.spriteFrame);
const contactAngle = legLineAngle(contactFrame);
const contactHeight = contactFrame.feet.leftFootHeight;

for (let frame = clampFromFrame; frame <= clampToFrame; frame += 1) {
  const current = frames.get(frame);
  const angle = legLineAngle(current);
  assert(angle <= contactAngle + 1.0, `visible left leg line rises above contact angle at frame ${frame} (${angle.toFixed(3)} vs contact ${contactAngle.toFixed(3)})`);
  assert(current.feet.leftFootHeight <= contactHeight + 0.02, `visible left foot rises above contact height at frame ${frame} (${current.feet.leftFootHeight.toFixed(3)} vs contact ${contactHeight.toFixed(3)})`);
}

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_axekick_finish_grounding');
