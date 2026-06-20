import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const payload = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_axekick_sf2.poseclip.json'), 'utf8'));
const evidence = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_axekick_sf2_visual_evidence.json'), 'utf8'));
const clip = payload.clip;
const failures = [];

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

function distance(a, b) {
  return Math.sqrt(a.reduce((total, value, index) => total + ((value - b[index]) ** 2), 0));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const frames = new Map(clip.userData.sourceReduction.spriteFrames.map((frame) => [frame.tag, frame]));
const hips = track('mixamorig:Hips.position');
const spine2 = track('mixamorig:Spine2.quaternion');
const leftLeg = track('mixamorig:LeftLeg.quaternion');

const snap = sampleAtFrame(hips, frames.get('snap').spriteFrame);
const contact = sampleAtFrame(hips, frames.get('contact').spriteFrame);
const contactHold = sampleAtFrame(hips, frames.get('contactHold').spriteFrame);
const recoil = sampleAtFrame(hips, frames.get('recoil').spriteFrame);
const recoverySettle = sampleAtFrame(hips, frames.get('recoverySettle').spriteFrame);
const settle = sampleAtFrame(hips, frames.get('settle').spriteFrame);

const snapToContactDrop = snap[1] - contact[1];
const heldDrop = snap[1] - contactHold[1];
const forwardDrive = contact[2] - snap[2];

assert(clip.userData.contactExaggeration?.kind === 'axe-kick-authored-impact-overcommit', 'AxeKick missing authored contactExaggeration metadata');
assert(evidence.contactExaggeration?.kind === 'axe-kick-authored-impact-overcommit', 'AxeKick visual evidence missing contactExaggeration metadata');
const evidenceContact = evidence.captureSlots.find((slot) => slot.tag === 'contact');
assert(evidenceContact?.contactModifiers?.some((modifier) => modifier.tag === 'crushingContact'), 'AxeKick contact evidence missing crushingContact modifier');
assert(snapToContactDrop >= 6.0, `AxeKick contact hip crash too small: ${snapToContactDrop.toFixed(3)}; expected >= 6`);
assert(heldDrop >= 6.0, `AxeKick held contact should preserve hip crash: ${heldDrop.toFixed(3)}; expected >= 6`);
assert(forwardDrive >= 0.5, `AxeKick contact should still drive forward through impact: ${forwardDrive.toFixed(3)}; expected >= 0.5`);
const metrics = JSON.parse(execFileSync('python3', ['tools/measure_poseclip_world_metrics.py', '--poseclip', 'assets/pose_indexes/ares_axekick_sf2.poseclip.json', '--view', 'xz'], { cwd: projectRoot, encoding: 'utf8' }));
function metricFrame(tag) { return metrics.frames.find((item) => item.tag === tag); }
const contactMetric = metricFrame('contact');
const holdMetric = metricFrame('contactHold');
const recoilMetric = metricFrame('recoil');
const recoverySettleMetric = metricFrame('recoverySettle');
const settleMetric = metricFrame('settle');

const contactSourceTime = Number(frames.get('contact').sourceTime.toFixed(5));
const holdSourceTime = Number(frames.get('contactHold').sourceTime.toFixed(5));
const recoilSourceTime = Number(frames.get('recoil').sourceTime.toFixed(5));
const recoverySettleSourceTime = Number(frames.get('recoverySettle').sourceTime.toFixed(5));
const groundedCarry = clip.userData?.groundedFinishLowerBodyCarry;
const torsoCompression = Number(clip.userData.contactExaggeration?.torsoCompressionRadians ?? 0);
assert(contactMetric.positions.leftFoot[1] <= 0.4, `AxeKick contact foot is still too high to read finished strike (${contactMetric.positions.leftFoot[1].toFixed(3)}); expected <= 0.4`);
assert(holdMetric.positions.leftFoot[1] <= 0.4, `AxeKick contactHold foot is still too high to read finished strike (${holdMetric.positions.leftFoot[1].toFixed(3)}); expected <= 0.4`);
assert(recoverySettleMetric.positions.leftFoot[1] <= holdMetric.positions.leftFoot[1] + 0.05, `AxeKick recoverySettle should keep the striking foot close to the held contact (${recoverySettleMetric.positions.leftFoot[1].toFixed(3)} vs ${holdMetric.positions.leftFoot[1].toFixed(3)})`);
assert(settleMetric.positions.leftFoot[1] <= recoverySettleMetric.positions.leftFoot[1] + 0.08, `AxeKick settle should stay near the recovery footline (${settleMetric.positions.leftFoot[1].toFixed(3)} vs ${recoverySettleMetric.positions.leftFoot[1].toFixed(3)})`);
assert(Math.abs(recoilMetric.positions.leftFoot[1] - holdMetric.positions.leftFoot[1]) <= 0.5, `AxeKick recoil should stay in the same recovery band as contactHold (${recoilMetric.positions.leftFoot[1].toFixed(3)} vs ${holdMetric.positions.leftFoot[1].toFixed(3)})`);
assert(contactSourceTime === 0.43333, `AxeKick contact should keep the authored upper-body strike source 0.43333, got ${contactSourceTime}`);
assert(holdSourceTime === 0.43333, `AxeKick contactHold should freeze the authored upper-body strike source 0.43333, got ${holdSourceTime}`);
assert(groundedCarry?.kind === 'sf2-grounded-finish-lower-body-carry', `AxeKick should publish grounded lower-body carry metadata, got ${groundedCarry?.kind}`);
assert(Number(groundedCarry?.sourceTime?.toFixed?.(5) ?? groundedCarry?.sourceTime) === 0.46667, `AxeKick grounded lower-body carry should sample finished strike source 0.46667, got ${groundedCarry?.sourceTime}`);
assert(recoilSourceTime === 0.53333, `AxeKick recoil should move to early recovery source 0.53333, got ${recoilSourceTime}`);
assert(recoverySettleSourceTime === 0.66667, `AxeKick recoverySettle should move to late recovery source 0.66667, got ${recoverySettleSourceTime}`);
assert(torsoCompression <= 0.22, `AxeKick contact torso compression over-curls shoulders (${torsoCompression}); expected <= 0.22`);
assert(distance(sampleAtFrame(leftLeg, frames.get('snap').spriteFrame), sampleAtFrame(leftLeg, frames.get('contact').spriteFrame)) >= 0.012, 'AxeKick contact lower-leg crash delta too small');

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_axekick_contact_overcommit');
console.log(JSON.stringify({
  snapToContactDrop: Number(snapToContactDrop.toFixed(3)),
  heldDrop: Number(heldDrop.toFixed(3)),
  forwardDrive: Number(forwardDrive.toFixed(3)),
  metadata: clip.userData.contactExaggeration.kind,
}, null, 2));
