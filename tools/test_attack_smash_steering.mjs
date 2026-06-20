import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets', 'pose_indexes', 'ares_sf2_attack_batch_manifest.json'), 'utf8'));
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function poseclipFor(attack) {
  const poseclipPath = path.join(projectRoot, attack.poseclip.split('?')[0]);
  const payload = JSON.parse(fs.readFileSync(poseclipPath, 'utf8'));
  return payload.clip || payload;
}

for (const attack of manifest.attacks || []) {
  const clip = poseclipFor(attack);
  const steering = attack.smashRealisticSteering || clip.userData?.smashRealisticSteering || null;

  if (attack.attackName === 'FrontKick') {
    assert(Boolean(steering), 'FrontKick should publish smashRealisticSteering metadata');
    assert(steering?.family === 'ballistic-kick', `FrontKick steering family mismatch: ${steering?.family}`);
    assert(steering?.observationCharacter === 'Ganondorf', `FrontKick observationCharacter mismatch: ${steering?.observationCharacter}`);
    assert(steering?.observationGame === 'Super Smash Bros. Ultimate', `FrontKick observationGame mismatch: ${steering?.observationGame}`);
    assert(steering?.timingBias === 'ballistic-snap', `FrontKick timingBias mismatch: ${steering?.timingBias}`);
    assert(steering?.appliedLayerKind === 'smash-realistic-frontkick-force-cheat', `FrontKick appliedLayerKind mismatch: ${steering?.appliedLayerKind}`);
    assert(Array.isArray(steering?.referenceMoves) && steering.referenceMoves.includes('Forward aerial'), 'FrontKick should reference Ganondorf forward aerial');
    assert(Array.isArray(steering?.avoid) && steering.avoid.includes('visible rubber scaling'), 'FrontKick steering should explicitly avoid visible rubber scaling');
    assert(clip.userData?.squashStretchLayer?.kind === 'smash-realistic-frontkick-force-cheat', 'FrontKick should still carry the actual squashStretchLayer');
  }

  if (['AxeKick', 'AxleKick', 'LowBackKick', 'SpinningHighKick'].includes(attack.attackName)) {
    assert(Boolean(steering), `${attack.attackName} should publish heavy Ganondorf steering metadata`);
    assert(steering?.family === 'heavy-kick', `${attack.attackName} steering family mismatch: ${steering?.family}`);
    assert(steering?.observationCharacter === 'Ganondorf', `${attack.attackName} observationCharacter mismatch: ${steering?.observationCharacter}`);
    assert(steering?.timingBias === 'heavy-commitment', `${attack.attackName} timingBias mismatch: ${steering?.timingBias}`);
    assert(Array.isArray(steering?.referenceMoves) && steering.referenceMoves.includes('Forward smash'), `${attack.attackName} should reference Ganondorf forward smash`);
  }

  if (attack.attackName === 'AxeKick') {
    assert(steering?.appliedLayerKind === 'smash-realistic-axekick-settle-cheat', `AxeKick appliedLayerKind mismatch: ${steering?.appliedLayerKind}`);
    assert(clip.userData?.squashStretchLayer?.kind === 'smash-realistic-axekick-settle-cheat', 'AxeKick should carry the settle squash/stretch layer');
  } else if (['AxleKick', 'LowBackKick', 'SpinningHighKick'].includes(attack.attackName)) {
    assert(!clip.userData?.squashStretchLayer, `${attack.attackName} should not silently inherit FrontKick squash/stretch data`);
  }
}

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_attack_smash_steering');
console.log(JSON.stringify({ checked: manifest.attacks.length }, null, 2));
