import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(projectRoot, 'assets', 'pose_indexes', 'ares_sf2_attack_batch_manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];
const origins = new Map();
const clips = [];

for (const attack of manifest.attacks || []) {
  if (!attack.poseclip) failures.push(`${attack.attackName}: missing poseclip path`);
  if (!attack.visualEvidence) failures.push(`${attack.attackName}: missing visual evidence path`);
  if (!attack.poseclip) continue;
  const poseclipPath = path.join(projectRoot, attack.poseclip);
  if (!fs.existsSync(poseclipPath)) {
    failures.push(`${attack.attackName}: missing poseclip file ${attack.poseclip}`);
    continue;
  }
  const payload = JSON.parse(fs.readFileSync(poseclipPath, 'utf8'));
  const clip = payload.clip || payload;
  clips.push({ attackName: attack.attackName, poseclip: attack.poseclip, clipName: clip.name });
  const label = clip.name || '';
  if (/\[v\d+\]/i.test(label)) failures.push(`${attack.attackName}: exposes failed version suffix in ${label}`);
  const origin = clip.userData?.origin;
  if (!origin) failures.push(`${attack.attackName}: missing userData.origin cache key`);
  if (origin) {
    if (origins.has(origin)) failures.push(`${attack.attackName}: duplicate origin ${origin} also used by ${origins.get(origin)}`);
    origins.set(origin, attack.attackName);
  }
}

const report = {
  schema: 'pose-lab-cache-key-audit-v1',
  manifest: path.relative(projectRoot, manifestPath),
  clipCount: clips.length,
  failures,
  clips,
};

if (failures.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
