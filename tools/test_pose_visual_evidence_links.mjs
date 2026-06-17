import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(projectRoot, 'assets', 'pose_indexes', 'ares_sf2_attack_batch_manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));
}

for (const attack of manifest.attacks || []) {
  if (!attack.visualEvidence) failures.push(`${attack.attackName}: batch manifest missing visualEvidence path`);
  if (attack.visualEvidence && !fs.existsSync(path.join(projectRoot, attack.visualEvidence))) failures.push(`${attack.attackName}: missing visual evidence file ${attack.visualEvidence}`);
}

const axe = (manifest.attacks || []).find((entry) => entry.attackName === 'AxeKick');
if (!axe?.visualEvidence) failures.push('AxeKick: no visual evidence path in manifest');

if (axe?.visualEvidence) {
  const evidence = readJson(axe.visualEvidence);
  const reduction = readJson(axe.reduction);
  const poseclip = readJson(axe.poseclip).clip;
  if (evidence.schema !== 'pose-lab-visual-evidence-v1') failures.push(`AxeKick: unexpected visual evidence schema ${evidence.schema}`);
  if (evidence.poseclip !== axe.poseclip) failures.push('AxeKick: visual evidence does not link poseclip path');
  if (evidence.reduction !== axe.reduction) failures.push('AxeKick: visual evidence does not link reduction path');
  if (evidence.index !== axe.index) failures.push('AxeKick: visual evidence does not link index path');
  if (evidence.critique !== axe.critique) failures.push('AxeKick: visual evidence does not link critique path');
  if ((evidence.captureSlots || []).length !== reduction.spriteFrames.length) {
    failures.push(`AxeKick: expected ${reduction.spriteFrames.length} capture slots, got ${(evidence.captureSlots || []).length}`);
  }

  const slotsByTag = new Map((evidence.captureSlots || []).map((slot) => [slot.tag, slot]));
  for (const frame of reduction.spriteFrames) {
    const slot = slotsByTag.get(frame.tag);
    if (!slot) {
      failures.push(`AxeKick: missing capture slot for ${frame.tag}`);
      continue;
    }
    const expectedKey = `ares:axekick:sf2:f${String(frame.spriteFrame).padStart(3, '0')}:${frame.tag}`;
    if (slot.evidenceKey !== expectedKey) failures.push(`AxeKick ${frame.tag}: expected evidenceKey ${expectedKey}, got ${slot.evidenceKey}`);
    if (slot.spriteFrame !== frame.spriteFrame) failures.push(`AxeKick ${frame.tag}: spriteFrame mismatch`);
    if (Math.abs(slot.poseclipTime - Number((frame.spriteFrame / 60).toFixed(5))) > 0.00001) failures.push(`AxeKick ${frame.tag}: poseclipTime mismatch`);
    if (slot.sourceTime !== frame.sourceTime) failures.push(`AxeKick ${frame.tag}: sourceTime mismatch`);
    if (!slot.screenshot?.expectedPath?.includes(`/f${String(frame.spriteFrame).padStart(3, '0')}_${frame.tag}.png`)) failures.push(`AxeKick ${frame.tag}: missing expected screenshot path`);
    if (typeof slot.screenshot.linked !== 'boolean') failures.push(`AxeKick ${frame.tag}: screenshot linked flag must be boolean`);
  }

  const snap = slotsByTag.get('snap');
  if (!snap?.overlayPhases?.some((phase) => phase.tag === 'snapBrace' && phase.sourceClipName === 'Headbutt')) failures.push('AxeKick snap: missing Headbutt snapBrace overlay link');
  const contact = slotsByTag.get('contact');
  if (!contact?.overlayPhases?.some((phase) => phase.tag === 'contactCarry' && phase.strength === 0.86)) failures.push('AxeKick contact: missing contactCarry overlay link');
  if (!Array.isArray(evidence.sourceOverlays) || evidence.sourceOverlays.length !== (poseclip.userData?.sourceOverlays || []).length) failures.push('AxeKick: sourceOverlays not mirrored into visual evidence');
}

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_pose_visual_evidence_links');
console.log(JSON.stringify({ attacks: manifest.attacks.length, checked: 'AxeKick visual evidence slots' }, null, 2));
