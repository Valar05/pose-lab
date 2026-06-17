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
const userData = poseclip.clip.userData;
const discipline = userData.headDiscipline;
const contactExaggeration = userData.contactExaggeration;

function frame(tag) {
  const found = metrics.frames.find((item) => item.tag === tag);
  if (!found) throw new Error(`missing metrics frame ${tag}`);
  return found;
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(discipline?.kind === 'sf2-head-discipline-observed-not-baked', `unexpected headDiscipline kind ${discipline?.kind}`);
assert(discipline?.enabled === false, 'AxeKick head/spine discipline must remain metadata-only until a visual test proves it improves the whole pose');
assert((discipline?.timeline || []).length === 0, 'disabled head discipline should not publish active timeline modifiers');
assert(contactExaggeration?.torsoCompressionRadians <= 0.32, `torso compression is over-authored (${contactExaggeration?.torsoCompressionRadians}); expected <= 0.32`);

for (const tag of ['contact', 'contactHold']) {
  const f = frame(tag);
  assert(!f.headDiscipline?.length, `${tag}: disabled head discipline should not appear as active frame modifier`);
  assert(f.xz.leftFootMinusHeadForward >= 0.28, `${tag}: attacking foot is not clearly forward of head (${f.xz.leftFootMinusHeadForward.toFixed(3)}); expected >= 0.28`);
  assert(f.xz.spine2MinusHipsForward <= -0.08, `${tag}: torso is stacking over the hips instead of driving the kick (${f.xz.spine2MinusHipsForward.toFixed(3)}); expected <= -0.08`);
  assert(f.xz.headMinusSpine2Forward <= 0.08, `${tag}: head is projecting ahead of torso commitment (${f.xz.headMinusSpine2Forward.toFixed(3)}); expected <= 0.08`);
}

for (const slot of evidence.captureSlots || []) {
  assert(!slot.headDiscipline?.length, `${slot.tag}: visual evidence should not include active head discipline modifiers while disabled`);
}
assert(evidence.headDiscipline?.enabled === false, 'visual evidence should mark head discipline as disabled metadata');

if (failures.length) throw new Error(failures.join('\\n'));

console.log('PASS test_axekick_head_discipline');
console.log(JSON.stringify({
  policy: 'head and torso discipline is observed but not baked',
  torsoCompressionRadians: contactExaggeration?.torsoCompressionRadians,
  contactFootMinusHeadForward: Number(frame('contact').xz.leftFootMinusHeadForward.toFixed(3)),
  contactHeadMinusSpine2Forward: Number(frame('contact').xz.headMinusSpine2Forward.toFixed(3)),
}, null, 2));
