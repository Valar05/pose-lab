import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const clipPayload = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_axekick_sf2.poseclip.json'), 'utf8'));
const clip = clipPayload.clip || clipPayload;
const metrics = JSON.parse(execFileSync('python3', ['tools/measure_poseclip_world_metrics.py', '--poseclip', 'assets/pose_indexes/ares_axekick_sf2.poseclip.json', '--frames', 'all', '--view', 'xz'], {
  cwd: projectRoot,
  encoding: 'utf8',
}));
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function quatDistance(a, b) {
  return Math.sqrt(((a[0] - b[0]) ** 2) + ((a[1] - b[1]) ** 2) + ((a[2] - b[2]) ** 2) + ((a[3] - b[3]) ** 2));
}

function track(name) {
  const found = clip.tracks.find((entry) => entry.name === name);
  if (!found) throw new Error(`missing track ${name}`);
  return found;
}

function sampleAtFrame(trackData, frame) {
  const time = Number((frame / 60).toFixed(5));
  const index = trackData.times.findIndex((entry) => Math.abs(Number(entry) - time) < 0.0002);
  if (index < 0) throw new Error(`${trackData.name}: missing frame ${frame}`);
  const stride = trackData.type === 'vector' ? 3 : trackData.type === 'quaternion' ? 4 : 1;
  return trackData.values.slice(index * stride, (index + 1) * stride).map(Number);
}

const frames = metrics.frames.filter((frame) => frame.spriteFrame >= 33 && frame.spriteFrame <= 39);
const contactHold = frames.find((frame) => frame.spriteFrame === 33);
assert(Boolean(contactHold), 'AxeKick missing contactHold frame for recovery footline check');

const contactLeg = sampleAtFrame(track('mixamorig:LeftLeg.quaternion'), 33);
let previousForward = contactHold.feet.leftFootMinusHipsForward;
for (const frame of frames) {
  const leg = sampleAtFrame(track('mixamorig:LeftLeg.quaternion'), frame.spriteFrame);
  const legDrift = quatDistance(leg, contactLeg);
  assert(legDrift <= 0.0001, `AxeKick recovery should not change left leg bend at frame ${frame.spriteFrame} (drift ${legDrift.toFixed(6)})`);

  const forward = frame.feet.leftFootMinusHipsForward;
  assert(forward <= previousForward + 0.01, `AxeKick recovery foot should slide back toward idle without popping forward at frame ${frame.spriteFrame} (${forward.toFixed(3)} vs ${previousForward.toFixed(3)})`);
  previousForward = forward;
}

assert(frames[frames.length - 1].feet.leftFootMinusHipsForward <= contactHold.feet.leftFootMinusHipsForward - 0.03, `AxeKick recovery foot should lerp back toward idle across the settle band (${frames[frames.length - 1].feet.leftFootMinusHipsForward.toFixed(3)} vs ${contactHold.feet.leftFootMinusHipsForward.toFixed(3)})`);

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_axekick_recovery_footline');
