import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const payload = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_axekick_sf2.poseclip.json'), 'utf8'));
const clip = payload.clip || payload;
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function track(name) {
  const found = clip.tracks.find((entry) => entry.name === name);
  if (!found) throw new Error(`missing track ${name}`);
  return found;
}

function vecAt(trackName, frame) {
  const values = track(trackName).values;
  const offset = frame * 3;
  return values.slice(offset, offset + 3).map(Number);
}

function delta(a, b, axis) {
  return Number((a[axis] - b[axis]).toFixed(6));
}

assert(clip.userData?.squashStretchLayer?.kind === 'smash-realistic-axekick-settle-cheat', 'AxeKick missing settle squash/stretch metadata');

const spine2Contact = vecAt('mixamorig:Spine2.scale', 33);
const spine2Release = vecAt('mixamorig:Spine2.scale', 36);
const spine2Recover = vecAt('mixamorig:Spine2.scale', 38);
const spine2Settle = vecAt('mixamorig:Spine2.scale', 40);

assert(delta(spine2Contact, [1, 1, 1], 1) <= -0.005, `AxeKick contact should compress spine2 on Y (${spine2Contact[1]})`);
assert(delta(spine2Contact, [1, 1, 1], 2) >= 0.005, `AxeKick contact should stretch spine2 forward on Z (${spine2Contact[2]})`);
assert(Math.abs(delta(spine2Release, spine2Contact, 1)) > 0.001 || Math.abs(delta(spine2Release, spine2Contact, 2)) > 0.001, 'AxeKick releaseCarry should not be identical to held contact');
assert(spine2Recover[1] > spine2Contact[1], `AxeKick recovery should relax spine2 compression (${spine2Recover[1]} vs ${spine2Contact[1]})`);
assert(spine2Settle[1] > spine2Recover[1], `AxeKick settle should ease further toward neutral (${spine2Settle[1]} vs ${spine2Recover[1]})`);
assert(Math.abs(spine2Settle[0] - 1) <= 0.02 && Math.abs(spine2Settle[1] - 1) <= 0.02 && Math.abs(spine2Settle[2] - 1) <= 0.02, `AxeKick settle should return close to neutral scale (${spine2Settle.join(', ')})`);

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_axekick_settle_squash_stretch');
