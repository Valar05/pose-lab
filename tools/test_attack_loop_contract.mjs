import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets', 'pose_indexes', 'ares_sf2_attack_batch_manifest.json'), 'utf8'));
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function sample(track, frame) {
  const stride = track.type === 'vector' ? 3 : track.type === 'quaternion' ? 4 : 1;
  return track.values.slice(frame * stride, (frame + 1) * stride).map(Number);
}

function distance(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  return Math.sqrt(a.reduce((sum, value, index) => sum + ((value - b[index]) ** 2), 0));
}

for (const attack of manifest.attacks || []) {
  const poseclipPath = path.join(projectRoot, attack.poseclip.split('?')[0]);
  const reductionPath = path.join(projectRoot, attack.reduction);
  const clip = (JSON.parse(fs.readFileSync(poseclipPath, 'utf8')).clip);
  const reduction = JSON.parse(fs.readFileSync(reductionPath, 'utf8'));
  const start = reduction.spriteFrames[0];
  const settle = reduction.spriteFrames[reduction.spriteFrames.length - 1];
  assert(Number(settle.sourceTime.toFixed(5)) === Number(start.sourceTime.toFixed(5)), `${attack.attackName}: settle sourceTime ${settle.sourceTime} must match start ${start.sourceTime} for perfect looping`);
  const lastFrame = Math.round(clip.duration * 60);
  let total = 0;
  for (const track of clip.tracks || []) {
    if (!/\.(position|quaternion)$/.test(track.name)) continue;
    const delta = distance(sample(track, 0), sample(track, lastFrame));
    total += delta * (track.name.endsWith('.position') ? 0.08 : 1);
  }
  assert(total <= 0.05, `${attack.attackName}: final baked frame does not match frame 0 (loop distance ${total.toFixed(3)})`);
}

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_attack_loop_contract');
console.log(JSON.stringify({ checked: manifest.attacks.length }, null, 2));
