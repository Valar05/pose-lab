import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const payload = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_frontkick_sf2.poseclip.json'), 'utf8'));
const clip = payload.clip || payload;
const userData = clip.userData || {};
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

function axisDelta(vec, baseline, axis) {
  return Number((vec[axis] - baseline[axis]).toFixed(6));
}

assert(userData.squashStretchLayer?.kind === 'smash-realistic-frontkick-force-cheat', 'frontkick missing smash-realistic squashStretchLayer metadata');

const leftLegAnticipation = vecAt('mixamorig:LeftLeg.scale', 9);
const leftLegContact = vecAt('mixamorig:LeftLeg.scale', 14);
const leftLegHold = vecAt('mixamorig:LeftLeg.scale', 15);
const leftLegRecoilSettle = vecAt('mixamorig:LeftLeg.scale', 22);
const spine2Contact = vecAt('mixamorig:Spine2.scale', 14);
const spine2Anticipation = vecAt('mixamorig:Spine2.scale', 9);
const supportLegContact = vecAt('mixamorig:RightLeg.scale', 14);

assert(axisDelta(leftLegContact, leftLegAnticipation, 1) >= 0.07, `frontkick striking shin should stretch on Y at contact (${axisDelta(leftLegContact, leftLegAnticipation, 1)}); expected >= 0.07`);
assert(axisDelta(leftLegContact, leftLegAnticipation, 2) >= 0.05, `frontkick striking shin should stretch on Z at contact (${axisDelta(leftLegContact, leftLegAnticipation, 2)}); expected >= 0.05`);
assert(Math.abs(axisDelta(leftLegHold, leftLegContact, 1)) <= 0.00001, `frontkick contactHold should preserve striking-leg stretch exactly (${axisDelta(leftLegHold, leftLegContact, 1)})`);
assert(Math.abs(axisDelta(leftLegRecoilSettle, leftLegAnticipation, 1)) <= 0.02, `frontkick striking-leg stretch should be mostly gone by recoilSettle (${axisDelta(leftLegRecoilSettle, leftLegAnticipation, 1)})`);
assert(axisDelta(spine2Contact, spine2Anticipation, 2) >= 0.04, `frontkick spine2 should stretch forward on Z at contact (${axisDelta(spine2Contact, spine2Anticipation, 2)}); expected >= 0.04`);
assert(axisDelta(spine2Anticipation, spine2Contact, 1) >= 0.02, `frontkick torso should squash slightly on Y at contact (${axisDelta(spine2Anticipation, spine2Contact, 1)}); expected >= 0.02`);
assert(supportLegContact[1] <= 0.95, `frontkick support leg should compress on Y at contact (${supportLegContact[1]}); expected <= 0.95`);
assert(Math.abs(leftLegContact[1] - 1.0) <= 0.1002, `frontkick striking-leg stretch should stay subtle enough to avoid visible rubber limbs (${leftLegContact[1]}); expected <= 1.100101`);
assert(Math.abs(spine2Contact[2] - 1.0) <= 0.0502, `frontkick torso extension should stay subtle (${spine2Contact[2]}); expected <= 1.050101`);

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_attack_squash_stretch');
console.log(JSON.stringify({
  frontkick: {
    leftLegAnticipation,
    leftLegContact,
    spine2Contact,
    supportLegContact,
  },
}, null, 2));
