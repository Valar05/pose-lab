import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets', 'pose_indexes', 'ares_sf2_attack_batch_manifest.json'), 'utf8'));
const failures = [];

function runJson(cmd, args) {
  return JSON.parse(execFileSync(cmd, args, { cwd: projectRoot, encoding: 'utf8' }));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

for (const attack of manifest.attacks || []) {
  const poseclip = attack.poseclip.split('?')[0];
  const grammar = runJson('python3', ['tools/classify_attack_grammar.py', '--poseclip', poseclip]);
  assert(grammar.schema === 'pose-lab-attack-grammar-v1', `${attack.attackName}: grammar schema mismatch`);
  if (attack.attackName === 'AxeKick') assert(grammar.family === 'heavy_kick', 'AxeKick should classify as heavy_kick');
  if (attack.attackName === 'FrontKick') {
    assert(grammar.family === 'ballistic_front_kick', 'FrontKick should classify as ballistic_front_kick');
    const ballistic = runJson('python3', ['tools/score_ballistic_path.py', '--poseclip', poseclip]);
    assert(ballistic.metrics.contactHoldFrames <= 2, `FrontKick contact hold too long for ballistic rule: ${ballistic.metrics.contactHoldFrames}`);
    assert(ballistic.metrics.retractVisibleDelta >= 0.9, `FrontKick retractVisibleDelta too small: ${ballistic.metrics.retractVisibleDelta}`);
  }
  if (attack.attackName === 'LowBackKick') {
    assert(grammar.family === 'heavy_chamber_kick', 'LowBackKick should classify as heavy_chamber_kick');
    const chamber = runJson('python3', ['tools/score_chamber_density.py', '--poseclip', poseclip]);
    assert(chamber.metrics.chamberHoldFrames >= 3, `LowBackKick chamber hold too short: ${chamber.metrics.chamberHoldFrames}`);
    assert(chamber.metrics.chamberFootHeight <= 0.35, `LowBackKick chamber too open: ${chamber.metrics.chamberFootHeight}`);
  }
}

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_attack_identity_rules');
console.log(JSON.stringify({ checked: manifest.attacks.length }, null, 2));
