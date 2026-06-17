import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
const expectedBones = ['mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2', 'mixamorig:Neck', 'mixamorig:Head'];
const kicks = ['frontkick', 'lowbackkick', 'spinninghighkick', 'axlekick'];

function loadPoseclip(stem) {
  const payload = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets', 'pose_indexes', `ares_${stem}_sf2.poseclip.json`), 'utf8'));
  return payload.clip || payload;
}

function loadEvidence(stem) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets', 'pose_indexes', `ares_${stem}_sf2_visual_evidence.json`), 'utf8'));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

for (const stem of kicks) {
  const clip = loadPoseclip(stem);
  const evidence = loadEvidence(stem);
  const carry = clip.userData?.kickPrecontactUpperBodyCarry;
  const frames = clip.userData?.sourceReduction?.spriteFrames || [];
  const byTag = new Map(frames.map((frame) => [frame.tag, frame]));
  const contact = byTag.get('contact');
  const hold = byTag.get('contactHold');
  assert(carry?.kind === 'sf2-kick-precontact-upper-body-carry', `${stem}: missing kickPrecontactUpperBodyCarry metadata`);
  if (!carry || !contact || !hold) continue;
  const expectedSource = Number((Number(contact.sourceTime) - 0.03333).toFixed(5));
  assert(Number(carry.sourceTime.toFixed(5)) === expectedSource, `${stem}: expected precontact carry source ${expectedSource}, got ${carry.sourceTime}`);
  assert(JSON.stringify(carry.targetBones || []) === JSON.stringify(expectedBones), `${stem}: unexpected carry bones ${JSON.stringify(carry.targetBones)}`);
  const evidenceContact = (evidence.captureSlots || []).find((slot) => slot.tag === 'contact');
  const evidenceHold = (evidence.captureSlots || []).find((slot) => slot.tag === 'contactHold');
  assert((evidenceContact?.kickPrecontactUpperBodyCarry || []).some((phase) => phase.tag === 'contactCarry' && Number(phase.sourceTime.toFixed(5)) === expectedSource), `${stem}: contact evidence missing contactCarry at ${expectedSource}`);
  assert((evidenceHold?.kickPrecontactUpperBodyCarry || []).some((phase) => phase.tag === 'heldContactCarry' && Number(phase.sourceTime.toFixed(5)) === expectedSource), `${stem}: contactHold evidence missing heldContactCarry at ${expectedSource}`);
}

const axe = loadPoseclip('axekick');
assert(!axe.userData?.kickPrecontactUpperBodyCarry, 'axekick: generic kick precontact carry should not override the bespoke AxeKick contact composition');

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_kick_precontact_upper_body_carry');
console.log(JSON.stringify({
  kicks,
  policy: 'non-Axe kicks publish shared precontact upper-body carry metadata and evidence',
}, null, 2));
