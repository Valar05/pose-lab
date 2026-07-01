import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(projectRoot, 'generated', 'test_runs', `weapon-fk-follow-${process.pid}`);
const output = execFileSync('node', [
  path.join(projectRoot, 'tools', 'weapon_fk_follow_offline.mjs'),
  '--out', outDir,
], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const dataPath = path.join(projectRoot, result.data);
const svgPath = path.join(projectRoot, result.svg);
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(result.ok === true, 'offline weapon follow verifier failed; the sabre is not proven to follow RightHand across animation samples');
assert(fs.existsSync(dataPath), `missing follow data artifact ${dataPath}`);
assert(fs.existsSync(svgPath), `missing follow SVG artifact ${svgPath}`);
assert(fs.statSync(svgPath).size > 500, 'follow SVG artifact should not be empty');
assert(data.schema === 'pose-lab-weapon-fk-follow-offline-v1', `unexpected schema ${data.schema}`);
assert(data.ok === true, 'weapon FK follow artifact should pass');
assert((data.samples || []).length >= 5, 'follow artifact should include sampled animation frames');
assert(JSON.stringify(data.parentChain) === JSON.stringify(['Meshy French Revolution Sabre', 'WeaponGrip-display-root', 'WeaponGrip', 'RightHand']), `unexpected weapon parent chain ${JSON.stringify(data.parentChain)}`);
assert(data.motion?.hand > 0.01, `RightHand did not move enough to prove animated following, got ${data.motion?.hand}`);
assert(data.motion?.socket > 0.01, `WeaponGrip did not move with the animated hand, got ${data.motion?.socket}`);
assert(data.motion?.display > 0.01, `display root did not move with WeaponGrip, got ${data.motion?.display}`);
assert(data.motion?.model > 0.01, `visible weapon model did not move with display root, got ${data.motion?.model}`);
assert(data.motion?.tip > 0.01, `weapon tip did not move with visible model, got ${data.motion?.tip}`);
assert(data.relativeDrift?.socketInHand < 0.005, `WeaponGrip drifted in RightHand space: ${data.relativeDrift?.socketInHand}`);
assert(data.relativeDrift?.displayInSocket < 0.005, `display root drifted in WeaponGrip space: ${data.relativeDrift?.displayInSocket}`);
assert(data.relativeDrift?.modelInDisplay < 0.005, `model drifted in display-root space: ${data.relativeDrift?.modelInDisplay}`);
assert(data.follows?.parentChain === true, 'offline verifier should prove RightHand -> WeaponGrip -> display root -> model/tip parent chain');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['offline-weapon-fk-follow', 'animated-hand-motion', 'visible-model-motion', 'stable-relative-parenting'],
  data: result.data,
  svg: result.svg,
  motion: data.motion,
  relativeDrift: data.relativeDrift,
}, null, 2));
