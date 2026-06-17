import fs from 'node:fs';
import path from 'node:path';
import { searchClipEntries } from '../src/clip-search.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const poseclipPath = path.join(projectRoot, 'assets', 'pose_indexes', 'ares_jab_sf2.poseclip.json');
const poseclipPayload = JSON.parse(fs.readFileSync(poseclipPath, 'utf8'));
const sf2Clip = poseclipPayload.clip || poseclipPayload;

const profileSource = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.gravity-fist.js'), 'utf8');
if (!profileSource.includes("startupClip: { name: 'Jab [sf2-eased]' }")) {
  throw new Error('Ares startupClip metadata no longer points at Jab [sf2-eased]');
}
if (!profileSource.includes('assets/pose_indexes/ares_jab_sf2.poseclip.json')) {
  throw new Error('Ares profile no longer points at ares_jab_sf2.poseclip.json');
}

if (sf2Clip.name !== 'Jab [sf2-eased]') {
  throw new Error(`Expected generated clip name "Jab [sf2-eased]", got "${sf2Clip.name}"`);
}

const clips = [
  { name: 'Jab', userData: { origin: 'own', sourceName: 'Jab' } },
  { name: 'Jab-Enemy', userData: { origin: 'shared-retarget', sourceName: 'Jab-Enemy' } },
  { name: sf2Clip.name, userData: { ...(sf2Clip.userData || {}), origin: 'own-extra:ares:' } },
];

const results = searchClipEntries('Jab', clips, 12);
const names = results.map((entry) => entry.clip.name);

if (results.length !== 3) {
  throw new Error(`Expected 3 Jab search matches, got ${results.length}: ${names.join(', ')}`);
}

if (!names.includes('Jab [sf2-eased]')) {
  throw new Error(`Expected Jab search to include "Jab [sf2-eased]", got: ${names.join(', ')}`);
}

console.log('PASS test_clip_search_jab');
console.log(JSON.stringify({ query: 'Jab', resultCount: results.length, names }, null, 2));
