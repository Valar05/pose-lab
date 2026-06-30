import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(projectRoot, 'generated', 'test_runs', `bone-orientation-${process.pid}`);
const output = execFileSync('node', [
  path.join(projectRoot, 'tools', 'render_bone_orientation_inspector.mjs'),
  '--out', outDir,
  '--frames', 'representative',
], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const dataPath = path.join(projectRoot, result.data);
const pngPath = path.join(projectRoot, result.png);
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(result.ok === true, 'inspector should complete');
assert(fs.existsSync(dataPath), `missing data artifact ${dataPath}`);
assert(fs.existsSync(pngPath), `missing PNG artifact ${pngPath}`);
assert(fs.statSync(pngPath).size > 1000, 'PNG artifact should not be empty');
assert(data.schema === 'pose-lab-bone-orientation-inspector-v1', `unexpected schema ${data.schema}`);
assert(data.meshPointCloudIncluded === true, 'inspector must include real model point-cloud context');
assert(data.weaponLandmarksIncluded === true, 'inspector must include saber landmarks');
assert(JSON.stringify(data.sourceBones) === JSON.stringify(['ShoulderCenter', 'Arm.R', 'Forearm.R', 'Hand.R', 'Weapon.R', 'Arm.L', 'Forearm.L', 'Hand.L']), 'source bone scope changed');
assert(JSON.stringify(data.targetBones) === JSON.stringify(['Spine02', 'RightArm', 'RightForeArm', 'RightHand', 'WeaponGrip', 'LeftArm', 'LeftForeArm', 'LeftHand']), 'target bone scope changed');
assert((data.frames || []).length >= 5, 'representative render should include at least five sampled frames');
const first = data.frames[0];
assert((first.fpsMesh || []).length > 100, 'FPS panel should include sampled skinned mesh points');
assert((first.meshyMesh || []).length > 100, 'Meshy panel should include sampled skinned mesh points');
assert((first.fpsTriads || []).some((entry) => entry.name === 'Weapon.R' && entry.forward && entry.actualUp && entry.side), 'FPS Weapon.R triad missing');
assert((first.meshyTriads || []).some((entry) => entry.name === 'WeaponGrip' && entry.forward && entry.actualUp && entry.desiredUp && Number.isFinite(entry.rollErrorDeg)), 'Meshy WeaponGrip desired-up roll triad missing');
assert(first.weapon?.hilt && first.weapon?.tip && first.weapon?.basketFront && first.weapon?.desiredBasketFront, 'saber hilt/tip/front landmarks missing');
assert(Number.isFinite(first.weapon?.basketFrontErrorDeg), 'saber basket-front error should be measured');
assert(Number.isFinite(first.weapon?.hiltToHandDistance), 'saber hilt-to-hand distance should be measured');
assert(first.weapon?.sourceUnitScale > 0 && first.weapon?.sourceUnitScale <= 1.1, `saber source unit scale should be finite and bounded, got ${first.weapon?.sourceUnitScale}`);
assert(first.weapon?.sourceMaxDimensionRaw > 0.25 && first.weapon?.sourceMaxDimensionRaw < 5, `saber raw source bounds should be parseable, got ${first.weapon?.sourceMaxDimensionRaw}`);
assert(first.weapon?.bladeLength > 0.25 && first.weapon?.bladeLength < 1.25, `saber blade length should be character-scale, got ${first.weapon?.bladeLength}`);
assert(Math.abs(first.weapon?.tip?.[0] || 0) < 4 && Math.abs(first.weapon?.tip?.[1] || 0) < 4 && Math.abs(first.weapon?.tip?.[2] || 0) < 4, `saber tip should stay near the character, got ${JSON.stringify(first.weapon?.tip)}`);
assert(data.triadContract?.rollErrorDeg?.includes('signed angle'), 'triad contract should document signed roll error');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['offline-bone-orientation-inspector', 'model-point-cloud', 'triads', 'saber-landmarks'], data: result.data, png: result.png }, null, 2));
