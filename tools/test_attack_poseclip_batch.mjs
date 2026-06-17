import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(projectRoot, 'assets', 'pose_indexes', 'ares_sf2_attack_batch_manifest.json');
const profilePath = path.join(projectRoot, 'src', 'rig-profiles.gravity-fist.js');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const profileSource = fs.readFileSync(profilePath, 'utf8');

if (manifest.schema !== 'pose-lab-sf2-attack-batch-v1') {
  throw new Error(`Unexpected manifest schema: ${manifest.schema}`);
}
if (manifest.generatedCount !== 13 || manifest.failureCount !== 0) {
  throw new Error(`Expected 13 generated attacks and 0 failures, got ${manifest.generatedCount}/${manifest.failureCount}`);
}
if (manifest.clipAliases?.LeftHook !== 'Hook') {
  throw new Error('Expected LeftHook to map to GLB clip Hook');
}

const missing = [];
for (const attack of manifest.attacks || []) {
  const poseclipPath = path.join(projectRoot, attack.poseclip.split('?')[0]);
  if (!fs.existsSync(poseclipPath)) {
    missing.push(`${attack.attackName}: missing ${attack.poseclip}`);
    continue;
  }
  const payload = JSON.parse(fs.readFileSync(poseclipPath, 'utf8'));
  const clip = payload.clip || payload;
  const expectedName = `${attack.attackName} [sf2-eased]`;
  if (clip.name !== expectedName) missing.push(`${attack.attackName}: expected clip name ${expectedName}, got ${clip.name}`);
  if (!Array.isArray(clip.tracks) || clip.tracks.length !== 126) missing.push(`${attack.attackName}: expected 126 tracks, got ${clip.tracks?.length}`);
  if (!profileSource.includes(attack.poseclip)) missing.push(`${attack.attackName}: profile does not include ${attack.poseclip}`);
  const tags = new Map((attack.anchors || []).map((anchor) => [anchor.tag, anchor]));
  for (const requiredTag of ['start', 'anticipation', 'contact', 'recoil', 'settle']) {
    if (!tags.has(requiredTag)) missing.push(`${attack.attackName}: missing ${requiredTag} anchor`);
  }
  const anticipation = tags.get('anticipation');
  const contact = tags.get('contact');
  if (anticipation && contact && contact.frameIndex === anticipation.frameIndex) {
    missing.push(`${attack.attackName}: contact anchor reuses anticipation frame ${contact.frameIndex}`);
  }
  if (!attack.attackStyle || !['punch', 'kick', 'headbutt'].includes(attack.attackStyle)) {
    missing.push(`${attack.attackName}: missing valid attackStyle`);
  }
}

if (missing.length) {
  throw new Error(missing.join('\n'));
}

console.log('PASS test_attack_poseclip_batch');
console.log(JSON.stringify({ generatedCount: manifest.generatedCount, poseclips: manifest.attacks.map((attack) => attack.poseclip) }, null, 2));
