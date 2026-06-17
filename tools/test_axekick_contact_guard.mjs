import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
const metrics = JSON.parse(execFileSync('python3', ['tools/measure_poseclip_world_metrics.py', '--poseclip', 'assets/pose_indexes/ares_axekick_sf2.poseclip.json', '--view', 'xz'], {
  cwd: projectRoot,
  encoding: 'utf8',
}));
const poseclip = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_axekick_sf2.poseclip.json'), 'utf8'));
const evidence = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_axekick_sf2_visual_evidence.json'), 'utf8'));
const userData = poseclip.clip.userData || {};
const guard = userData.contactGuardStabilization;

function frame(tag) {
  const found = metrics.frames.find((item) => item.tag === tag);
  if (!found) throw new Error(`missing metrics frame ${tag}`);
  return found;
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(guard?.enabled === true, 'AxeKick should publish enabled contactGuardStabilization metadata');
assert(guard?.mode === 'local-upperarm-contact-guard-lift', `unexpected contact guard mode ${guard?.mode}`);
assert(JSON.stringify(guard?.targetBones || []) === JSON.stringify(['mixamorig:LeftArm', 'mixamorig:RightArm']), `contact guard should only target upper arms, got ${JSON.stringify(guard?.targetBones)}`);

for (const tag of ['contact', 'contactHold']) {
  const f = frame(tag);
  assert(f.guard.leftHandBelowSpine2Y <= 0.12, `${tag}: left fist reads dropped below torso guard (${f.guard.leftHandBelowSpine2Y.toFixed(3)}); expected <= 0.12`);
  assert(f.guard.rightHandBelowSpine2Y <= 0.12, `${tag}: right fist reads dropped below torso guard (${f.guard.rightHandBelowSpine2Y.toFixed(3)}); expected <= 0.12`);
  assert(f.guard.leftHandBelowHeadY <= 0.22, `${tag}: left fist too far below lifted head (${f.guard.leftHandBelowHeadY.toFixed(3)}); expected <= 0.22`);
  assert(f.guard.rightHandBelowHeadY <= 0.22, `${tag}: right fist too far below lifted head (${f.guard.rightHandBelowHeadY.toFixed(3)}); expected <= 0.22`);
}

{
  const f = frame('recoil');
  assert(f.guard.leftHandBelowSpine2Y <= 0.2, `recoil: left fist loses guard carry (${f.guard.leftHandBelowSpine2Y.toFixed(3)}); expected <= 0.2`);
  assert(f.guard.rightHandBelowSpine2Y <= 0.2, `recoil: right fist loses guard carry (${f.guard.rightHandBelowSpine2Y.toFixed(3)}); expected <= 0.2`);
  assert(f.guard.leftHandBelowHeadY <= 0.36, `recoil: left fist too far below lifted head (${f.guard.leftHandBelowHeadY.toFixed(3)}); expected <= 0.36`);
  assert(f.guard.rightHandBelowHeadY <= 0.36, `recoil: right fist too far below lifted head (${f.guard.rightHandBelowHeadY.toFixed(3)}); expected <= 0.36`);
}

for (const tag of ['start', 'settle']) {
  const f = frame(tag);
  assert(f.guard.leftHandBelowHeadY <= 0.16, `${tag}: left hand should remain in guard (${f.guard.leftHandBelowHeadY.toFixed(3)})`);
  assert(f.guard.rightHandBelowHeadY <= 0.16, `${tag}: right hand should remain in guard (${f.guard.rightHandBelowHeadY.toFixed(3)})`);
}

const contactSlot = evidence.captureSlots?.find((slot) => slot.tag === 'contact');
assert(evidence.contactGuardStabilization?.enabled === true, 'visual evidence should include enabled contactGuardStabilization metadata');
assert(contactSlot?.contactGuardStabilization?.some((phase) => phase.tag === 'contactGuardLift' && phase.strength >= 0.2), 'contact evidence should include contactGuardLift phase');

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_axekick_contact_guard');
console.log(JSON.stringify({
  contactLeftBelowSpine2Y: Number(frame('contact').guard.leftHandBelowSpine2Y.toFixed(3)),
  contactRightBelowSpine2Y: Number(frame('contact').guard.rightHandBelowSpine2Y.toFixed(3)),
  targetBones: guard.targetBones,
}, null, 2));
