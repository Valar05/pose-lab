import fs from 'node:fs';
import path from 'node:path';
import { defaultClipEntries, isSf2PoseClip } from '../src/clip-search.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const poseIndexDir = path.join(projectRoot, 'assets', 'pose_indexes');
const files = fs.readdirSync(poseIndexDir).filter((name) => /^ares_.*_sf2\.poseclip\.json$/.test(name)).sort();
const sf2Clips = files.map((name) => {
  const payload = JSON.parse(fs.readFileSync(path.join(poseIndexDir, name), 'utf8'));
  return payload.clip || payload;
});

if (sf2Clips.length < 10) {
  throw new Error(`Expected the generated Ares SF2 batch, got only ${sf2Clips.length} files`);
}

const normalClips = [
  { name: 'Idle', userData: { origin: 'own', sourceName: 'Idle' } },
  { name: 'Walk', userData: { origin: 'own', sourceName: 'Walk' } },
  { name: 'Jab', userData: { origin: 'own', sourceName: 'Jab' } },
];
const visible = defaultClipEntries([...normalClips, ...sf2Clips], ['own:Jab'], '');
const names = visible.map((entry) => entry.clip.name);

for (const clip of sf2Clips) {
  if (!isSf2PoseClip(clip)) throw new Error(`Generated clip was not classified as SF2: ${clip.name}`);
  if (!names.includes(clip.name)) throw new Error(`Default clip list omitted generated SF2 clip: ${clip.name}`);
  if (/\[v\d+\]/i.test(clip.name)) throw new Error(`Generated clip still has failed-version label: ${clip.name}`);
}
for (const clip of normalClips) {
  if (names.includes(clip.name)) throw new Error(`Default SF2 list should not be narrowed by recent normal clip: ${clip.name}`);
}
if (visible.length !== sf2Clips.length) {
  throw new Error(`Expected exactly all SF2 clips by default, got ${visible.length} entries for ${sf2Clips.length} SF2 clips: ${names.join(', ')}`);
}

console.log('PASS test_clip_default_sf2');
console.log(JSON.stringify({ sf2Count: sf2Clips.length, names }, null, 2));
