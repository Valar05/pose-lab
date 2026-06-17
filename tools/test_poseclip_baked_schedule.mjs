import fs from 'node:fs';
import path from 'node:path';
import { clipLabel } from '../src/clip-search.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];

function loadClip(stem) {
  const filePath = path.join(projectRoot, 'assets', 'pose_indexes', `${stem}_sf2.poseclip.json`);
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return payload.clip || payload;
}

function trackByName(clip, name) {
  const track = clip.tracks.find((entry) => entry.name === name);
  if (!track) throw new Error(`${clip.name}: missing track ${name}`);
  return track;
}

function sampleAtFrame(track, frame) {
  const time = Number((frame / 60).toFixed(5));
  const index = track.times.findIndex((entry) => Math.abs(Number(entry) - time) < 0.0002);
  if (index < 0) throw new Error(`${track.name}: missing baked frame ${frame} at ${time}`);
  const stride = track.type === 'vector' ? 3 : track.type === 'quaternion' ? 4 : 1;
  return track.values.slice(index * stride, (index + 1) * stride).map(Number);
}

function distance(a, b) {
  return Math.sqrt(a.reduce((total, value, index) => total + ((value - b[index]) ** 2), 0));
}

function assertClose(label, a, b, epsilon = 0.00001) {
  const delta = distance(a, b);
  if (delta > epsilon) failures.push(`${label}: expected held samples to match, delta ${delta}`);
}

function assertFar(label, a, b, minDelta) {
  const delta = distance(a, b);
  if (delta < minDelta) failures.push(`${label}: expected visible baked change >= ${minDelta}, got ${delta}`);
}

function assertSourceFrames(clip, expected) {
  const frames = clip.userData?.sourceReduction?.spriteFrames || [];
  const actual = frames.map((frame) => `${frame.tag}:${frame.spriteFrame}:${Number(frame.sourceTime).toFixed(5)}`);
  for (const item of expected) {
    if (!actual.includes(item)) failures.push(`${clip.name}: missing source schedule ${item}; actual ${actual.join(', ')}`);
  }
}

const axe = loadClip('ares_axekick');
const axle = loadClip('ares_axlekick');
const lowBack = loadClip('ares_lowbackkick');

for (const clip of [axe, axle, lowBack]) {
  const label = clipLabel(clip);
  if (/\[v\d+\]/i.test(label)) failures.push(`${clip.name}: visible label still exposes failed-version suffix: ${label}`);
  if (clip.userData?.sourceReduction?.appealScoring !== 'source-burst-clean') failures.push(`${clip.name}: expected source-burst-clean scoring, got ${clip.userData?.sourceReduction?.appealScoring}`);
}

assertSourceFrames(axe, [
  'anticipation:6:0.16667',
  'anticipationHold:11:0.20000',
  'lift:14:0.26667',
  'apex:17:0.36667',
  'apexHold:19:0.36667',
  'snap:21:0.40000',
  'contact:22:0.43333',
  'contactHold:33:0.43333',
  'recoil:36:0.70000',
  'recoverySettle:38:0.76667',
]);
assertSourceFrames(axle, [
  'windup:6:0.23333',
  'anticipation:11:0.30000',
  'snap:14:0.40000',
  'contact:18:0.46667',
  'contactHold:23:0.46667',
]);
assertSourceFrames(lowBack, [
  'windup:5:0.16667',
  'anticipation:10:0.23333',
  'anticipationHold:13:0.26667',
  'contact:18:0.33333',
  'contactHold:23:0.33333',
  'recoil:27:0.80000',
]);

const axeHip = trackByName(axe, 'mixamorig:Hips.position');
assertFar('AxeKick baked start->anticipation hips', sampleAtFrame(axeHip, 0), sampleAtFrame(axeHip, 6), 4.0);
assertFar('AxeKick baked moving anticipation hold hips', sampleAtFrame(axeHip, 6), sampleAtFrame(axeHip, 11), 4.0);
assertFar('AxeKick baked anticipationHold->lift hips', sampleAtFrame(axeHip, 11), sampleAtFrame(axeHip, 14), 15.0);
assertFar('AxeKick baked lift->apex hips', sampleAtFrame(axeHip, 14), sampleAtFrame(axeHip, 17), 2.0);
assertClose('AxeKick baked apex hang hips', sampleAtFrame(axeHip, 17), sampleAtFrame(axeHip, 19));
assertFar('AxeKick baked apexHold->contact hips', sampleAtFrame(axeHip, 19), sampleAtFrame(axeHip, 22), 20.0);
assertClose('AxeKick baked contact hold hips', sampleAtFrame(axeHip, 22), sampleAtFrame(axeHip, 33));
assertFar('AxeKick baked committed recovery hips', sampleAtFrame(axeHip, 33), sampleAtFrame(axeHip, 36), 1.5);
assertFar('AxeKick baked stance reform hips', sampleAtFrame(axeHip, 36), sampleAtFrame(axeHip, 38), 1.0);

const axeLeg = trackByName(axe, 'mixamorig:LeftUpLeg.quaternion');
assertFar('AxeKick baked moving anticipation hold leg', sampleAtFrame(axeLeg, 6), sampleAtFrame(axeLeg, 11), 0.05);
assertFar('AxeKick baked anticipationHold->lift leg', sampleAtFrame(axeLeg, 11), sampleAtFrame(axeLeg, 14), 0.6);
assertFar('AxeKick baked lift->apex leg', sampleAtFrame(axeLeg, 14), sampleAtFrame(axeLeg, 17), 0.2);
assertClose('AxeKick baked apex hang leg', sampleAtFrame(axeLeg, 17), sampleAtFrame(axeLeg, 19));
assertFar('AxeKick baked apexHold->contact leg', sampleAtFrame(axeLeg, 19), sampleAtFrame(axeLeg, 22), 0.45);
assertFar('AxeKick baked snap->contact leg', sampleAtFrame(axeLeg, 21), sampleAtFrame(axeLeg, 22), 0.45);
assertClose('AxeKick baked contact hold leg', sampleAtFrame(axeLeg, 22), sampleAtFrame(axeLeg, 33));
assertFar('AxeKick baked committed recovery leg', sampleAtFrame(axeLeg, 33), sampleAtFrame(axeLeg, 36), 0.25);
assertFar('AxeKick baked stance reform leg', sampleAtFrame(axeLeg, 36), sampleAtFrame(axeLeg, 38), 0.005);

const axleHip = trackByName(axle, 'mixamorig:Hips.position');
assertFar('AxleKick baked windup->anticipation hips', sampleAtFrame(axleHip, 6), sampleAtFrame(axleHip, 11), 35.0);
assertFar('AxleKick baked anticipation->snap hips', sampleAtFrame(axleHip, 11), sampleAtFrame(axleHip, 14), 8.0);
assertFar('AxleKick baked snap->contact hips', sampleAtFrame(axleHip, 14), sampleAtFrame(axleHip, 18), 1.0);
assertClose('AxleKick baked contact hold hips', sampleAtFrame(axleHip, 18), sampleAtFrame(axleHip, 23));

const lowBackHip = trackByName(lowBack, 'mixamorig:Hips.position');
assertFar('LowBackKick baked windup->anticipation hips', sampleAtFrame(lowBackHip, 5), sampleAtFrame(lowBackHip, 10), 1.0);
assertFar('LowBackKick baked anticipation->anticipationHold hips', sampleAtFrame(lowBackHip, 10), sampleAtFrame(lowBackHip, 13), 0.6);
assertFar('LowBackKick baked anticipationHold->contact hips', sampleAtFrame(lowBackHip, 13), sampleAtFrame(lowBackHip, 18), 3.0);
assertClose('LowBackKick baked contact hold hips', sampleAtFrame(lowBackHip, 18), sampleAtFrame(lowBackHip, 23));

const lowBackLeg = trackByName(lowBack, 'mixamorig:RightUpLeg.quaternion');
assertFar('LowBackKick baked windup->anticipation leg', sampleAtFrame(lowBackLeg, 5), sampleAtFrame(lowBackLeg, 10), 0.04);
assertFar('LowBackKick baked anticipation->anticipationHold leg', sampleAtFrame(lowBackLeg, 10), sampleAtFrame(lowBackLeg, 13), 0.02);
assertFar('LowBackKick baked anticipationHold->contact leg', sampleAtFrame(lowBackLeg, 13), sampleAtFrame(lowBackLeg, 18), 0.2);
assertClose('LowBackKick baked contact hold leg', sampleAtFrame(lowBackLeg, 18), sampleAtFrame(lowBackLeg, 23));

if (failures.length) throw new Error(failures.join('\\n'));

console.log('PASS test_poseclip_baked_schedule');
console.log(JSON.stringify({
  clips: [clipLabel(axe), clipLabel(axle)],
  policy: 'assert clean generated labels, baked key samples, and exact contact holds',
}, null, 2));
