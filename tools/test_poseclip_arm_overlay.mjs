import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const poseclipPath = path.join(projectRoot, 'assets', 'pose_indexes', 'ares_axekick_sf2.poseclip.json');
const payload = JSON.parse(fs.readFileSync(poseclipPath, 'utf8'));
const clip = payload.clip || payload;
const failures = [];

function trackByName(name) {
  const track = (clip.tracks || []).find((entry) => entry.name === name);
  if (!track) failures.push(`AxeKick arm overlay: missing track ${name}`);
  return track;
}

function sampleAtFrame(track, frame) {
  const time = Number((frame / 60).toFixed(5));
  const index = track.times.findIndex((entry) => Math.abs(Number(entry) - time) < 0.0002);
  if (index < 0) {
    failures.push(`${track.name}: missing baked frame ${frame} at ${time}`);
    return null;
  }
  const stride = track.type === 'quaternion' ? 4 : track.type === 'vector' ? 3 : 1;
  return track.values.slice(index * stride, (index + 1) * stride).map(Number);
}

function distance(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  return Math.sqrt(a.reduce((total, value, index) => total + ((value - b[index]) ** 2), 0));
}

function assertFar(label, trackName, fromFrame, toFrame, minDelta) {
  const track = trackByName(trackName);
  if (!track) return 0;
  const delta = distance(sampleAtFrame(track, fromFrame), sampleAtFrame(track, toFrame));
  if (delta < minDelta) failures.push(`${label}: expected ${trackName} delta >= ${minDelta}, got ${delta.toFixed(4)}`);
  return delta;
}

function assertClose(label, trackName, fromFrame, toFrame, epsilon = 0.00001) {
  const track = trackByName(trackName);
  if (!track) return;
  const delta = distance(sampleAtFrame(track, fromFrame), sampleAtFrame(track, toFrame));
  if (delta > epsilon) failures.push(`${label}: expected held ${trackName} delta <= ${epsilon}, got ${delta.toFixed(6)}`);
}

const overlays = clip.userData?.sourceOverlays || [];
const headbuttOverlay = overlays.find((entry) => entry.kind === 'upper-limb-rotation-overlay' && entry.sourceClipName === 'Headbutt');
if (!headbuttOverlay) {
  failures.push('AxeKick arm overlay: missing Headbutt upper-limb source overlay metadata');
} else {
  if (headbuttOverlay.mode !== 'phase-blend-local-arm-rotations') failures.push(`AxeKick arm overlay: unexpected mode ${headbuttOverlay.mode}`);
  if (headbuttOverlay.trackCount !== 8) failures.push(`AxeKick arm overlay: expected 8 overlaid tracks, got ${headbuttOverlay.trackCount}`);
  const timeline = headbuttOverlay.timeline || [];
  const strengths = timeline.map((entry) => Number(entry.strength));
  const snapBrace = timeline.find((entry) => entry.tag === 'snapBrace' && entry.spriteFrame === 21);
  const contactCarry = timeline.find((entry) => entry.tag === 'contactCarry' && entry.spriteFrame === 22);
  if (!strengths.length || Math.max(...strengths) < 0.82) failures.push('AxeKick arm overlay: braced snap phase is not strong enough');
  if (strengths[1] >= Math.max(...strengths)) failures.push('AxeKick arm overlay: chamber should be subtler than snap brace');
  if (!snapBrace) failures.push('AxeKick arm overlay: missing pre-contact snapBrace at frame 21');
  if (snapBrace && Number(snapBrace.sourceTime.toFixed(5)) !== 0.3) failures.push(`AxeKick arm overlay: snapBrace should reach Headbutt impact source at 0.30000, got ${snapBrace.sourceTime}`);
  if (snapBrace && contactCarry && snapBrace.strength !== contactCarry.strength) failures.push('AxeKick arm overlay: contact should carry the pre-contact arm brace, not keep ramping after it');
  if (headbuttOverlay.boneStrength?.['mixamorig:LeftShoulder'] >= headbuttOverlay.boneStrength?.['mixamorig:LeftArm']) {
    failures.push('AxeKick arm overlay: shoulders should be constrained below upper arms');
  }
  for (const bone of ['mixamorig:LeftShoulder', 'mixamorig:LeftHand', 'mixamorig:RightShoulder', 'mixamorig:RightHand']) {
    if (!headbuttOverlay.targetBones?.includes(bone)) failures.push(`AxeKick arm overlay: metadata missing target bone ${bone}`);
  }
}

const coreTracks = [
  'mixamorig:LeftShoulder.quaternion',
  'mixamorig:LeftArm.quaternion',
  'mixamorig:LeftForeArm.quaternion',
  'mixamorig:LeftHand.quaternion',
  'mixamorig:RightShoulder.quaternion',
  'mixamorig:RightArm.quaternion',
  'mixamorig:RightForeArm.quaternion',
  'mixamorig:RightHand.quaternion',
];


function trackDelta(trackName, fromFrame, toFrame) {
  const track = trackByName(trackName);
  if (!track) return 0;
  return distance(sampleAtFrame(track, fromFrame), sampleAtFrame(track, toFrame));
}

function armDeltaTotal(fromFrame, toFrame) {
  let total = 0;
  for (const trackName of coreTracks) {
    total += trackDelta(trackName, fromFrame, toFrame);
  }
  return total;
}

let anticipationToContactTotal = armDeltaTotal(6, 22);
if (anticipationToContactTotal < 0.65) {
  failures.push(`AxeKick arm overlay: arm anticipation->contact total delta ${anticipationToContactTotal.toFixed(4)} is too static; expected >= 0.9`);
}

assertFar('AxeKick overlay left shoulder participates', 'mixamorig:LeftShoulder.quaternion', 6, 22, 0.015);
assertFar('AxeKick overlay right shoulder participates', 'mixamorig:RightShoulder.quaternion', 6, 22, 0.02);
assertFar('AxeKick overlay left arm commits', 'mixamorig:LeftArm.quaternion', 6, 22, 0.1);
assertFar('AxeKick overlay right arm commits', 'mixamorig:RightArm.quaternion', 6, 22, 0.12);
assertFar('AxeKick overlay left hand stops freezing', 'mixamorig:LeftHand.quaternion', 6, 22, 0.03);
assertFar('AxeKick overlay right hand stops freezing', 'mixamorig:RightHand.quaternion', 6, 22, 0.025);

const chamberDelta = armDeltaTotal(6, 14);
const whipDelta = armDeltaTotal(14, 21);
const postSnapDelta = armDeltaTotal(21, 22);
if (whipDelta < chamberDelta * 0.85) failures.push(`AxeKick arm overlay: whip delta ${whipDelta.toFixed(4)} should dominate chamber delta ${chamberDelta.toFixed(4)}`);
if (postSnapDelta > whipDelta * 0.35) failures.push(`AxeKick arm overlay: arms keep arriving after snap; postSnap=${postSnapDelta.toFixed(4)} whip=${whipDelta.toFixed(4)}`);

const leftForearmWhip = trackDelta('mixamorig:LeftForeArm.quaternion', 14, 21);
const leftHandWhip = trackDelta('mixamorig:LeftHand.quaternion', 14, 21);
const rightForearmWhip = trackDelta('mixamorig:RightForeArm.quaternion', 14, 21);
const rightHandWhip = trackDelta('mixamorig:RightHand.quaternion', 14, 21);
if (leftHandWhip > leftForearmWhip * 0.72) failures.push(`AxeKick arm overlay: left wrist flicker ${leftHandWhip.toFixed(4)} should stay below forearm-driven whip ${leftForearmWhip.toFixed(4)}`);
if (rightHandWhip > rightForearmWhip * 0.72) failures.push(`AxeKick arm overlay: right wrist flicker ${rightHandWhip.toFixed(4)} should stay below forearm-driven whip ${rightForearmWhip.toFixed(4)}`);
if (leftHandWhip < 0.09) failures.push(`AxeKick arm overlay: left hand follow-through ${leftHandWhip.toFixed(4)} is too damped to read`);
if (rightHandWhip < 0.07) failures.push(`AxeKick arm overlay: right hand follow-through ${rightHandWhip.toFixed(4)} is too damped to read`);

assertClose('AxeKick overlay impact arm hold', 'mixamorig:RightArm.quaternion', 22, 33);
assertClose('AxeKick overlay impact hand hold', 'mixamorig:LeftHand.quaternion', 22, 33);

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_poseclip_arm_overlay');
console.log(JSON.stringify({
  clip: clip.name,
  overlay: headbuttOverlay.sourceClipName,
  armDelta7to25: Number(anticipationToContactTotal.toFixed(4)),
}, null, 2));
